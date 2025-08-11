import { NextResponse } from "next/server";
import { env } from "~/env";
import { PaymentKind } from "@prisma/client";
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
    if (!apiKey) return NextResponse.json({ type: "error", message: "Missing OpenAI key" }, { status: 500 });

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

    const tools = buildToolsSchema(mode);
    const first = await openAIChat(apiKey, {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages,
      tools,
      tool_choice: "auto",
    });

    const message = first?.choices?.[0]?.message ?? {};
    const call = message?.tool_calls?.[0];
    const fnName = call?.function?.name as string | undefined;
    const fnArgs = safeParseJSON(call?.function?.arguments);

    if (mode === "find" && fnName === "find_similar_quotes") {
      const args = sanitizeFindArgs(fnArgs);
      if (!args.packageId && !args.productName) {
        return NextResponse.json({ type: "error", message: "Specify a package (id or name)." }, { status: 400 });
      }
      const results = await trpcCaller.quote.findSimilarQuotes(args);
      return NextResponse.json({ type: "find_results", data: results });
    }

    if (mode === "create" && fnName === "create_quote") {
      const args = sanitizeCreateArgs(fnArgs);
      if (!args.packageId && !args.productName) {
        return NextResponse.json({ type: "assistant_message", message: "Which package? Provide name or id." });
      }
      if (!args.customerName) {
        return NextResponse.json({ type: "assistant_message", message: "What is the customerName?" });
      }

      // Always infer/normalize for MVP simplicity
      const similar = await trpcCaller.quote.findSimilarQuotes(sanitizeFindArgs(args));
      const top3 = similar?.results?.slice(0, 3) ?? [];
      const deduced = await runDeductionLLM(apiKey, args, top3);
      const finalArgs: any = { ...args, ...deduced };

      if (!(Number.isInteger(finalArgs.seats) && finalArgs.seats > 0)) finalArgs.seats = 10;
      if (typeof finalArgs.paymentKind !== "string" || !["NET", "PREPAY", "BOTH"].includes(finalArgs.paymentKind)) finalArgs.paymentKind = "PREPAY";
      if (finalArgs.paymentKind === "NET" && !(Number.isInteger(finalArgs.netDays) && finalArgs.netDays > 0)) finalArgs.netDays = 30;
      if (finalArgs.paymentKind === "BOTH") {
        if (!(Number.isInteger(finalArgs.netDays) && finalArgs.netDays > 0)) finalArgs.netDays = 30;
        if (typeof finalArgs.prepayPercent !== "number") finalArgs.prepayPercent = 50;
      }
      if (finalArgs.paymentKind === "PREPAY" && finalArgs.prepayPercent == null) finalArgs.prepayPercent = 100;

      const created = await trpcCaller.quote.createQuote(finalArgs);
      if (created?.status === "ok") {
        return NextResponse.json({ type: "quote_created", quoteId: created.quoteId, data: { ...created, similarUsedTop3: top3, autoFilled: true } });
      }
      return NextResponse.json({ type: "assistant_message", message: "Unable to create quote. Provide package and customer if missing." });
    }

    // Default: return the assistant content if no tool was called
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
      Objective:
      - Minimal user input: package (id or name) and customerName; add-ons optional.
      - You have ONE tool: create_quote. Use it as soon as you have package and customerName.

      Rules:
      - If create_quote fails due to missing non-core fields (seats/payment/etc.), the server will infer and retry automatically.
      - Only ask if package or customerName is missing; keep it to 1 short question.
      - After successful creation, stop.`
    );
}

function buildToolsSchema(mode: Mode) {
  // Only expose find tool in Find mode; only expose create tool in Create mode
  if (mode === "find") {
    return [
      {
        type: "function",
        function: {
          name: "find_similar_quotes",
          description:
            "Find approved/sold quotes that match given fields. Call as soon as a package (id or exact name) is known. Inputs are optional beyond package.",
          parameters: {
            type: "object",
            properties: {
              packageId: { type: "string", description: "Exact package ID if known" },
              productName: { type: "string", description: "Product/package name (prefer exact)" },
              seats: { type: "integer", description: "Desired seat count, used for ±20 seat band scoring" },
              discountPercent: { type: "number", description: "Desired discount percent, used for ±10% scoring" },
              addOnIds: { type: "array", items: { type: "string" } },
              addOnNames: { type: "array", items: { type: "string" } },
              paymentKind: { type: "string", enum: ["NET", "PREPAY", "BOTH"] },
            },
            additionalProperties: false,
          },
        },
      },
    ];
  }
  return [
    {
      type: "function",
      function: {
        name: "create_quote",
        description:
          "Create a new quote. Prefer minimal input (packageId or productName and customerName). Missing non-core fields (seats/payment/etc.) will be inferred server-side.",
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
          required: [],
          additionalProperties: false,
        },
      },
    },
  ];
}

function sanitizeFindArgs(input: any) {
  const args: any = {};
  if (typeof input?.packageId === "string" && input.packageId.trim()) args.packageId = input.packageId.trim();
  if (typeof input?.productName === "string" && input.productName.trim()) args.productName = input.productName.trim();
  if (Number.isInteger(input?.seats) && input.seats > 0) args.seats = input.seats;
  if (typeof input?.discountPercent === "number") args.discountPercent = clamp(input.discountPercent, 0, 100);
  if (Array.isArray(input?.addOnIds)) args.addOnIds = input.addOnIds.filter((x: any) => typeof x === "string");
  if (Array.isArray(input?.addOnNames)) args.addOnNames = input.addOnNames.filter((x: any) => typeof x === "string");
  if (typeof input?.paymentKind === "string" && ["NET", "PREPAY", "BOTH"].includes(input.paymentKind)) args.paymentKind = input.paymentKind as PaymentKind;
  return args;
}

function sanitizeCreateArgs(input: any) {
  const args: any = {};
  if (typeof input?.packageId === "string" && input.packageId.trim()) args.packageId = input.packageId.trim();
  if (typeof input?.productName === "string" && input.productName.trim()) args.productName = input.productName.trim();
  if (Number.isInteger(input?.seats) && input.seats > 0) args.seats = input.seats;
  if (typeof input?.discountPercent === "number") args.discountPercent = clamp(input.discountPercent, 0, 100);
  if (Array.isArray(input?.addOnIds)) args.addOnIds = input.addOnIds.filter((x: any) => typeof x === "string");
  if (Array.isArray(input?.addOnNames)) args.addOnNames = input.addOnNames.filter((x: any) => typeof x === "string");
  if (typeof input?.customerName === "string" && input.customerName.trim()) args.customerName = input.customerName.trim();
  if (typeof input?.paymentKind === "string" && ["NET", "PREPAY", "BOTH"].includes(input.paymentKind)) args.paymentKind = input.paymentKind as PaymentKind;
  if (Number.isInteger(input?.netDays) && input.netDays > 0) args.netDays = input.netDays;
  if (typeof input?.prepayPercent === "number") args.prepayPercent = clamp(input.prepayPercent, 0, 100);
  return args;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
//

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

async function runDeductionLLM(apiKey: string, partialInput: any, examples: any[]) {
  const system = `You fill missing quote fields concisely based on patterns in examples. Output STRICT JSON only with keys: seats (int), discountPercent (0-100), paymentKind (NET|PREPAY|BOTH), netDays (int|null), prepayPercent (0-100|null). If PREPAY and prepayPercent missing, omit it.`;
  const user = JSON.stringify({ partialInput, examples });
  try {
    const data = await openAIChat(apiKey, {
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Fill missing fields. Input: ${user}` },
      ],
    });
    const text = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeParseJSON(text);
    const out: any = {};
    if (Number.isInteger(parsed.seats) && parsed.seats > 0) out.seats = parsed.seats;
    if (typeof parsed.discountPercent === "number") out.discountPercent = clamp(parsed.discountPercent, 0, 100);
    if (typeof parsed.paymentKind === "string" && ["NET", "PREPAY", "BOTH"].includes(parsed.paymentKind)) out.paymentKind = parsed.paymentKind;
    if (Number.isInteger(parsed.netDays) && parsed.netDays > 0) out.netDays = parsed.netDays;
    if (typeof parsed.prepayPercent === "number") out.prepayPercent = clamp(parsed.prepayPercent, 0, 100);
    return out;
  } catch {
    return {};
  }
}

// --- Minimal helpers for MVP ---
async function openAIChat(apiKey: string, payload: any): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(txt || res.statusText);
  }
  return res.json();
}

function safeParseJSON(input: unknown): any {
  if (typeof input !== "string" || !input.trim()) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}


