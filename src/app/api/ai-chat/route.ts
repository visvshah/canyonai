import { NextResponse } from "next/server";
import { env } from "~/env";
import { PaymentKind, Prisma } from "@prisma/client";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

type Mode = "find" | "create";

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

export async function POST(req: Request) {
  try {
    const apiKey = env.OPENAI_KEY;
    if (!apiKey) {
      return NextResponse.json({ type: "error", message: "Missing OpenAI key" }, { status: 500 });
    }

    const body = (await req.json()) as { mode: Mode; messages: ClientMessage[] };
    const mode = body.mode;
    const clientMessages = Array.isArray(body.messages) ? body.messages : [];

    const trpcCtx = await createTRPCContext({ headers: req.headers } as any);
    const trpcCaller = createCaller(trpcCtx);

    const catalogText = await buildCatalogContext(trpcCtx);
    const system = buildSystemPrompt(mode, catalogText);
    const messages: OpenAIMessage[] = [
      { role: "system", content: system },
      ...clientMessages.map((m) => ({ role: m.role, content: m.content }) as OpenAIMessage),
    ];

    const tools = buildToolsSchema();

    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages,
        tools,
        tool_choice: "auto",
      }),
    });

    if (!chatRes.ok) {
      const txt = await safeText(chatRes);
      return NextResponse.json({ type: "error", message: `OpenAI error: ${txt || chatRes.statusText}` }, { status: 500 });
    }

    const chatJson = (await chatRes.json()) as any;
    const choice = chatJson?.choices?.[0];
    const message = choice?.message;

    // Tool call flow
    const toolCalls = message?.tool_calls ?? [];
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const call = toolCalls[0]!; // We will handle the first call and stop
      const fnName = call.function?.name as string | undefined;
      let fnArgs: any = {};
      try {
        fnArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        fnArgs = {};
      }

      if (fnName === "find_similar_quotes") {
        const args = sanitizeFindArgs(fnArgs);
        // Enforce package presence server-side as well; add-ons are optional
        const hasPackage = Boolean(args.packageId) || Boolean(args.productName);
        if (!hasPackage) {
          return NextResponse.json({ type: "error", message: "Specify a package (id or name)." }, { status: 400 });
        }
        const results = await trpcCaller.quote.findSimilarQuotes(args);
        return NextResponse.json({ type: "find_results", data: results });
      }

      if (fnName === "create_quote") {
        const args = sanitizeCreateArgs(fnArgs);
        const result = await trpcCaller.quote.createQuote(args as any);
        if (result?.status === "ok") {
          return NextResponse.json({ type: "quote_created", quoteId: result.quoteId, data: result });
        }
        // If error, let the model ask for corrections
        const toolMsg: OpenAIMessage = {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        };
        const followup = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [...messages, message, toolMsg],
            tools,
            tool_choice: "auto",
          }),
        });
        if (!followup.ok) {
          const txt = await safeText(followup);
          return NextResponse.json(
            { type: "error", message: `OpenAI error: ${txt || followup.statusText}` },
            { status: 500 },
          );
        }
        const followJson = (await followup.json()) as any;
        const followChoice = followJson?.choices?.[0];
        const followMessage = followChoice?.message;
        return NextResponse.json({ type: "assistant_message", message: followMessage?.content });
      }
    }

    // No tool call
    return NextResponse.json({ type: "assistant_message", message: message?.content });
  } catch (err: any) {
    return NextResponse.json({ type: "error", message: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

function buildSystemPrompt(mode: Mode, catalogText: string): string {
  const COMMON_PROMPT = `
    You are Canyon CPQ’s quote copilot.
    Your job is to (a) extract only the fields needed to make a tool call and (b) call the tool as soon as those fields are available.

    Style:
    - Be concise. When asking questions, use 1–2 short sentences and ask only for missing required fields.
    - Do not explain your reasoning, summarize plans, or add chit-chat.
    - Never invent products or add-ons. The catalog below is ground truth.

    Catalog usage:
    - Treat synonyms: "seats" ≈ "licenses" ≈ "users"; "discount" ≈ "% off"; "package" may refer to a product tier/bundle.

    General rules:
    - If a tool call is possible, CALL IT IMMEDIATELY
    - If a tool call is not yet possible, ask the single smallest question that unblocks it.
    - Use the user’s exact wording/values when filling fields (don’t “clean up” names or numbers - but resolve products and add-ons to the following attached catalog names/ids when making tool calls).

    Catalog of products and add-ons (ground truth):
    ${catalogText}

`.trim();
  if (mode === "find") {
    return (
      COMMON_PROMPT +
      `\nMode: Find quotes (retrieve similar approved quotes).

        Goal:
        - Call find_similar_quotes as soon as a package is identified.

        Rules:
        - The ONLY required field is a specific package (id or exact name from the catalog).
        - As soon as the user specifies a package, CALL find_similar_quotes IMMEDIATELY.
        - Add-ons are optional; include them only if the user mentions any.
        - Provide any known fields; the tool tolerates partial inputs.`
      );
  }
  return (
    COMMON_PROMPT +
      `\n\nMode: Create quote.
      - Ask minimal clarifying questions to gather required fields.
      - Required: productName
      - If paymentKind is NET, require netDays. If BOTH, require both netDays and prepayPercent (PREPAY can default to 100 if omitted).
      - When all required info is present, call create_quote immediately with the fields as provided.
      - After calling the tool successfully, STOP. Do not continue chatting.`
    );
}

function buildToolsSchema() {
  return [
    {
      type: "function",
      function: {
        name: "find_similar_quotes",
        description:
          "Find approved quotes that MATCH the provided package. Call immediately once a package (id or exact name) is known. The tool tolerates partial inputs.",
        parameters: {
          type: "object",
          properties: {
            packageId: { type: "string", description: "Exact package ID if known" },
            productName: { type: "string", description: "Product/package name (prefer exact)" },
            addOnIds: { type: "array", items: { type: "string" } },
            addOnNames: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_quote",
        description:
          "Create a new quote. Provide resolved fields. Must include productName or packageId, seats, customerName, and paymentKind. Enforce paymentKind field coherence.",
        parameters: {
          type: "object",
          properties: {
            packageId: { type: "string" },
            productName: { type: "string" },
            seats: { type: "integer", minimum: 1 },
            discountPercent: { type: "number", minimum: 0, maximum: 100 },
            addOnIds: { type: "array", items: { type: "string" } },
            addOnNames: { type: "array", items: { type: "string" } },
            customerName: { type: "string" },
            paymentKind: { type: "string", enum: ["NET", "PREPAY", "BOTH"] },
            netDays: { type: "integer", minimum: 1 },
            prepayPercent: { type: "number", minimum: 0, maximum: 100 },
          },
          required: ["seats", "customerName", "paymentKind"],
          additionalProperties: false,
        },
      },
    },
  ];
}

function sanitizeFindArgs(input: any) {
  const args: any = {};
  if (typeof input.packageId === "string" && input.packageId.trim()) args.packageId = input.packageId.trim();
  if (typeof input.productName === "string" && input.productName.trim()) args.productName = input.productName.trim();
  if (Number.isInteger(input.seats) && input.seats > 0) args.seats = input.seats;
  if (typeof input.discountPercent === "number") args.discountPercent = clamp(input.discountPercent, 0, 100);
  if (Array.isArray(input.addOnIds)) args.addOnIds = input.addOnIds.filter((x: any) => typeof x === "string");
  if (Array.isArray(input.addOnNames)) args.addOnNames = input.addOnNames.filter((x: any) => typeof x === "string");
  if (typeof input.paymentKind === "string" && ["NET", "PREPAY", "BOTH"].includes(input.paymentKind)) args.paymentKind = input.paymentKind as PaymentKind;
  return args;
}

function sanitizeCreateArgs(input: any) {
  const args: any = {};
  if (typeof input.packageId === "string" && input.packageId.trim()) args.packageId = input.packageId.trim();
  if (typeof input.productName === "string" && input.productName.trim()) args.productName = input.productName.trim();
  if (Number.isInteger(input.seats) && input.seats > 0) args.seats = input.seats;
  if (typeof input.discountPercent === "number") args.discountPercent = clamp(input.discountPercent, 0, 100);
  if (Array.isArray(input.addOnIds)) args.addOnIds = input.addOnIds.filter((x: any) => typeof x === "string");
  if (Array.isArray(input.addOnNames)) args.addOnNames = input.addOnNames.filter((x: any) => typeof x === "string");
  if (typeof input.customerName === "string" && input.customerName.trim()) args.customerName = input.customerName.trim();
  if (typeof input.paymentKind === "string" && ["NET", "PREPAY", "BOTH"].includes(input.paymentKind)) args.paymentKind = input.paymentKind as PaymentKind;
  if (Number.isInteger(input.netDays) && input.netDays > 0) args.netDays = input.netDays;
  if (typeof input.prepayPercent === "number") args.prepayPercent = clamp(input.prepayPercent, 0, 100);
  return args;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function clampInt(n: number, min: number, max: number) {
  return Math.round(clamp(n, min, max));
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function buildCatalogContext(trpcCtx: Awaited<ReturnType<typeof createTRPCContext>>): Promise<string> {
  const db = trpcCtx.db;

  const sessionUserId = trpcCtx.session?.user?.id ?? null;
  let orgId: string | undefined;
  if (sessionUserId) {
    orgId = (await db.user.findUnique({ where: { id: sessionUserId }, select: { orgId: true } }))?.orgId ?? undefined;
  }
  if (!orgId) {
    orgId = (await db.org.findFirst({ select: { id: true } }))?.id;
  }

  const [packages, addOns] = await Promise.all([
    db.package.findMany({ where: orgId ? { orgId } : undefined, select: { id: true, name: true, unitPrice: true }, orderBy: { name: "asc" } }),
    db.addOn.findMany({ where: orgId ? { orgId } : undefined, select: { id: true, name: true, unitPrice: true }, orderBy: { name: "asc" } }),
  ]);

  const pkgLines = packages
    .slice(0, 50)
    .map((p) => `- ${p.name} (id: ${p.id})`)
    .join("\n");
  const addOnLines = addOns
    .slice(0, 50)
    .map((a) => `- ${a.name} (id: ${a.id})`)
    .join("\n");

  return `Packages:\n${pkgLines}\nAdd-ons:\n${addOnLines}`;
}


