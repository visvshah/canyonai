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
  const common = `You are a helpful CPQ assistant inside Canyon CPQ.
- Always keep replies brief and targeted (1-2 sentences max when asking questions).
- Ask only for the missing fields required to make a tool call.
- Do not invent products or add-ons. Use the organization's catalog below.
- Prefer exact names from the catalog; if the user's term is ambiguous, propose the closest 2-3 options from the catalog and ask them to pick.
- Once a tool call is possible, call it immediately and then STOP.

Catalog for this organization (use these names and ids as ground truth):
${catalogText}`;
  if (mode === "find") {
    return (
      common +
      `\n\nMode: Find quotes.
- Ask minimal clarifying questions (product/package, seats, notable add-ons, discount, payment kind).
- When you have enough signal to search (at least product name OR seats), call find_similar_quotes with any provided fields.
- After calling the tool, STOP. Do not continue chatting.`
    );
  }
  return (
    common +
    `\n\nMode: Create quote.
- Ask minimal clarifying questions to gather required fields.
- Required: productName (or packageId), seats, customerName, paymentKind.
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
          "Find similar approved/sold quotes. Provide any known fields; the tool tolerates partial inputs and returns ranked results.",
        parameters: {
          type: "object",
          properties: {
            packageId: { type: "string", description: "Exact package ID if known" },
            productName: { type: "string", description: "Product/package name or partial match" },
            seats: { type: "integer", minimum: 1 },
            discountPercent: { type: "number", minimum: 0, maximum: 100 },
            addOnIds: { type: "array", items: { type: "string" } },
            addOnNames: { type: "array", items: { type: "string" } },
            paymentKind: { type: "string", enum: ["NET", "PREPAY", "BOTH"] },
            recentDays: { type: "integer", minimum: 1, maximum: 3650 },
            limit: { type: "integer", minimum: 1, maximum: 50 },
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
  if (Number.isInteger(input.recentDays)) args.recentDays = clampInt(input.recentDays, 1, 3650);
  if (Number.isInteger(input.limit)) args.limit = clampInt(input.limit, 1, 50);
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
  // Resolve an org to scope catalog (prefer session user's org; else first org)
  let orgId: string | null = null;
  try {
    const sessionUserId = trpcCtx.session?.user?.id ?? null;
    let user: any = null;
    if (sessionUserId) {
      user = await db.user.findUnique({ where: { id: sessionUserId }, select: { orgId: true } });
    } else {
      user = await db.user.findFirst({ select: { orgId: true } });
    }
    orgId = user?.orgId ?? (await db.org.findFirst({ select: { id: true } }))?.id ?? null;
  } catch {
    orgId = null;
  }

  const whereOrg = orgId ? { orgId } : {};
  const [packages, addOns] = await Promise.all([
    db.package.findMany({ where: whereOrg as any, select: { id: true, name: true, unitPrice: true }, orderBy: { name: "asc" } }),
    db.addOn.findMany({ where: whereOrg as any, select: { id: true, name: true, unitPrice: true }, orderBy: { name: "asc" } }),
  ]);

  const pkgLines = packages
    .slice(0, 50)
    .map((p) => `- ${p.name} (id: ${p.id}, $${Number(p.unitPrice).toFixed(2)}/unit)`) // limit length
    .join("\n");
  const addOnLines = addOns
    .slice(0, 50)
    .map((a) => `- ${a.name} (id: ${a.id}, $${Number(a.unitPrice).toFixed(2)}/unit)`) // limit length
    .join("\n");

  return `Packages:\n${pkgLines || "- (none)"}\n\nAdd-ons:\n${addOnLines || "- (none)"}`;
}


