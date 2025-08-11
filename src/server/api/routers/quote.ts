import { z } from "zod";
import { Prisma, Role, ApprovalStatus, QuoteStatus, PaymentKind } from "@prisma/client";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { env } from "~/env";

const updateQuoteStatus = async (
  tx: Prisma.TransactionClient,
  quoteId: string,
) => {
  const existing = await tx.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  if (existing?.status === QuoteStatus.Sold) {
    return QuoteStatus.Sold;
  }

  const workflow = await tx.approvalWorkflow.findUnique({
    where: { quoteId },
    include: { steps: true },
  });

  let newStatus: QuoteStatus;
  const steps = workflow?.steps ?? [];

  if (steps.length === 0) {
    newStatus = QuoteStatus.Approved;
  } else if (steps.some((s) => s.status === ApprovalStatus.Rejected)) {
    newStatus = QuoteStatus.Rejected;
  } else if (steps.some((s) => s.status === ApprovalStatus.Pending)) {
    newStatus = QuoteStatus.Pending;
  } else {
    newStatus = QuoteStatus.Approved;
  }

  await tx.quote.update({ where: { id: quoteId }, data: { status: newStatus } });
  return newStatus;
};

const recomputeWorkflowGating = async (
  tx: Prisma.TransactionClient,
  quoteId: string,
) => {
  const workflow = await tx.approvalWorkflow.findUnique({
    where: { quoteId },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  if (!workflow) return;
  const steps = workflow.steps;
  if (steps.length === 0) return;
  if (steps.some((s) => s.status === ApprovalStatus.Rejected)) return;
  const firstNonApprovedIndex = steps.findIndex((s) => s.status !== ApprovalStatus.Approved);
  if (firstNonApprovedIndex === -1) return;
  const now = new Date();
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i]!;
    if (st.status === ApprovalStatus.Approved) continue;
    const desired = i === firstNonApprovedIndex ? ApprovalStatus.Pending : ApprovalStatus.Waiting;
    if (st.status !== desired) {
      if (desired === ApprovalStatus.Pending) {
        await tx.approvalStep.update({ where: { id: st.id }, data: { status: desired, updatedAt: now } });
      } else {
        await tx.approvalStep.update({ where: { id: st.id }, data: { status: desired, updatedAt: null } });
      }
    } else if (desired === ApprovalStatus.Pending && !st.updatedAt) {
      await tx.approvalStep.update({ where: { id: st.id }, data: { updatedAt: now } });
    }
  }
};

export const quoteRouter = createTRPCRouter({
  catalog: publicProcedure.query(async ({ ctx }) => {
    const sessionUserId = ctx.session?.user?.id ?? null;
    let orgId: string | undefined;
    if (sessionUserId) {
      orgId = (await ctx.db.user.findUnique({ where: { id: sessionUserId }, select: { orgId: true } }))?.orgId ?? undefined;
    }
    if (!orgId) {
      orgId = (await ctx.db.org.findFirst({ select: { id: true } }))?.id;
    }
    const [packages, addOns] = await Promise.all([
      ctx.db.package.findMany({ where: orgId ? { orgId } : undefined, select: { id: true, name: true } , orderBy: { name: "asc" } }),
      ctx.db.addOn.findMany({ where: orgId ? { orgId } : undefined, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { packages, addOns } as const;
  }),
  /**
   * Fetch quotes whose next pending step persona matches the provided role.
   * "Next pending" is defined as the first step in order with status Pending.
   */
  pendingByRole: publicProcedure
    .input(z.object({ role: z.nativeEnum(Role) }))
    .query(async ({ ctx, input }) => {
      const quotes = await ctx.db.quote.findMany({
        where: { status: QuoteStatus.Pending },
        include: {
          org: true,
          package: true,
          approvalWorkflow: {
            include: {
              steps: {
                include: { approver: true },
                orderBy: { stepOrder: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return quotes.filter((q) => {
        const steps = q.approvalWorkflow?.steps ?? [];
        const firstPending = steps.find((s) => s.status === ApprovalStatus.Pending);
        return firstPending?.persona === input.role;
      });
    }),

  /**
   * Fetch all quotes. Optionally filter by a search string that matches the
   * customer name or organisation name (case-insensitive, partial match).
   */
  all: publicProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          packageIds: z.array(z.string()).optional(),
          addOnIds: z.array(z.string()).optional(),
          paymentKinds: z.array(z.nativeEnum(PaymentKind)).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const containsKeyword = (value: string) => ({
        contains: value,
        mode: "insensitive" as const,
      });

      const andConditions: Prisma.QuoteWhereInput[] = [];

      if (input?.search && input.search.trim()) {
        andConditions.push({
          OR: [
            { customerName: containsKeyword(input.search) },
            {
              org: {
                is: {
                  name: containsKeyword(input.search),
                },
              },
            },
          ],
        });
      }

      if (input?.packageIds && input.packageIds.length > 0) {
        andConditions.push({ packageId: { in: input.packageIds } });
      }

      if (input?.addOnIds && input.addOnIds.length > 0) {
        andConditions.push({ addOns: { some: { id: { in: input.addOnIds } } } });
      }

      if (input?.paymentKinds && input.paymentKinds.length > 0) {
        andConditions.push({ paymentKind: { in: input.paymentKinds } });
      }

      const where: Prisma.QuoteWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

      return ctx.db.quote.findMany({
        where,
        include: {
          org: true,
          package: true,
          addOns: true,
          createdBy: true,
          approvalWorkflow: {
            include: {
              steps: {
                include: {
                  approver: true,
                },
                orderBy: { stepOrder: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /**
   * Fetch a single quote by id, including related entities and ordered steps.
   */
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const quote = await ctx.db.quote.findUnique({
        where: { id: input.id },
        include: {
          org: true,
          package: true,
          addOns: true,
          createdBy: true,
          approvalWorkflow: {
            include: {
              steps: {
                include: { approver: true },
                orderBy: { stepOrder: "asc" },
              },
            },
          },
        },
      });

      if (!quote) throw new Error("Quote not found");
      return quote;
    }),
    
  /**
   * Approve the next pending step for a quote as a given role.
   * Fails if the next pending step persona does not match the provided role.
   */
  approveNextForRole: publicProcedure
    .input(z.object({ quoteId: z.string(), role: z.nativeEnum(Role) }))
    .mutation(async ({ ctx, input }) => {
      const { quoteId, role } = input;
      return ctx.db.$transaction(async (tx) => {
        const workflow = await tx.approvalWorkflow.findUnique({
          where: { quoteId },
          include: { steps: { orderBy: { stepOrder: "asc" } } },
        });
        if (!workflow) {
          throw new Error("Approval workflow not found for quote");
        }
        const nextPending = workflow.steps.find((s) => s.status === ApprovalStatus.Pending);
        if (!nextPending) {
          throw new Error("No pending approval step for this quote");
        }
        if (nextPending.persona !== role) {
          throw new Error("Next pending step does not match the selected role");
        }

        await tx.approvalStep.update({
          where: { id: nextPending.id },
          data: { status: ApprovalStatus.Approved, approvedAt: new Date() },
        });

        await recomputeWorkflowGating(tx, quoteId);
        const newStatus = await updateQuoteStatus(tx, quoteId);
        return { success: true, newStatus } as const;
      });
    }),
    
  /**
   * Replace the entire workflow for a quote with the provided ordered steps, then recompute quote status.
   */
  setWorkflow: publicProcedure
    .input(
      z.object({
        quoteId: z.string(),
        steps: z
          .array(
            z.object({
              persona: z.nativeEnum(Role),
              approverEmail: z.string().email().optional(),
              status: z.nativeEnum(ApprovalStatus).optional(),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { quoteId, steps } = input;
      await ctx.db.$transaction(async (tx) => {
        const existing = await tx.approvalWorkflow.findUnique({
          where: { quoteId },
          include: { steps: true },
        });
        const workflowId = existing
          ? existing.id
          : (await tx.approvalWorkflow.create({ data: { quoteId } })).id;

        await tx.approvalStep.deleteMany({ where: { approvalWorkflowId: workflowId } });

        const now = new Date();
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i]!;
          let approverId: string | null = null;
          if (s.approverEmail) {
            const user = await tx.user.findUnique({ where: { email: s.approverEmail } });
            approverId = user?.id ?? null;
          }
          await tx.approvalStep.create({
            data: {
              approvalWorkflowId: workflowId,
              stepOrder: i + 1,
              persona: s.persona,
              approverId,
              status: s.status ?? ApprovalStatus.Waiting,
              updatedAt: s.status === ApprovalStatus.Pending ? now : null,
            },
          });
        }

        await recomputeWorkflowGating(tx, quoteId);
        await updateQuoteStatus(tx, quoteId);
      });
      return { success: true };
    }),

  /**
   * Find similar quotes based on structured, partially-specified fields.
   * Ranking favors exact package match, close seat counts, overlapping add-ons, similar discount,
   * same payment kind, and recency. Results are limited, explainable, and JSON-friendly.
   */
  findSimilarQuotes: publicProcedure
    .input(
      z
        .object({
          packageId: z.string().optional(),
          productName: z.string().optional(),
          seats: z.number().int().positive().optional(),
          discountPercent: z.number().min(0).max(100).optional(),
          addOnIds: z.array(z.string()).optional().default([]),
          addOnNames: z.array(z.string()).optional().default([]),
          paymentKind: z.nativeEnum(PaymentKind).optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const params = input;
      const recentThreshold = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      const candidates = await ctx.db.quote.findMany({
        where: {
          createdAt: { gte: recentThreshold },
          status: { in: [QuoteStatus.Approved, QuoteStatus.Sold] },
        },
        include: {
          package: true,
          addOns: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });

      const normalizedProduct = (params.productName ?? "").trim().toLowerCase();
      const normalizedAddOnNames = (params.addOnNames ?? []).map((n: string) => n.trim().toLowerCase());
      const addOnIdSet = new Set(params.addOnIds ?? []);

      const seats = params.seats;
      const seatBandAbs = 20;

      const scored = candidates.map((q) => {
        let score = 0;
        const reasons: string[] = [];

        if (params.packageId && q.packageId === params.packageId) {
          score += 4;
          reasons.push("same packageId");
        } else if (normalizedProduct) {
          const name = q.package.name.toLowerCase();
          if (name === normalizedProduct) {
            score += 3;
            reasons.push("exact product name match");
          } else if (name.includes(normalizedProduct)) {
            score += 2;
            reasons.push("product name contains");
          }
        }

        if (seats != null) {
          const diff = Math.abs(q.quantity - seats);
          if (diff === 0) {
            score += 3;
            reasons.push("exact seat count");
          } else if (diff <= 10) {
            score += 2;
            reasons.push("close seat count");
          } else if (diff <= seatBandAbs) {
            score += 1;
            reasons.push("within seat band");
          }
        }

        if (params.discountPercent != null) {
          const provided = params.discountPercent;
          const diff = Math.abs(Number(q.discountPercent) - provided);
          const allowed = Math.max(1, Math.round(provided * 0.1));
          if (diff === 0) {
            score += 2;
            reasons.push("exact discount");
          } else if (diff <= allowed) {
            score += 1;
            reasons.push("discount in range");
          }
        }

        if (addOnIdSet.size > 0 || normalizedAddOnNames.length > 0) {
          let overlap = 0;
          for (const ao of q.addOns) {
            if (addOnIdSet.has(ao.id)) overlap += 1;
            else if (normalizedAddOnNames.some((n) => ao.name.toLowerCase().includes(n))) overlap += 1;
          }
          if (overlap > 0) {
            score += Math.min(3, overlap);
            reasons.push(`${overlap} add-on overlap`);
          }
        }

        if (params.paymentKind && q.paymentKind === params.paymentKind) {
          score += 1;
          reasons.push("same payment kind");
        }

        const daysAgo = (Date.now() - q.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo <= 90) {
          score += 1;
          reasons.push("recent");
        }

        return { q, score, reasons };
      });

      const ranked = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => (b.score - a.score) || (b.q.createdAt.getTime() - a.q.createdAt.getTime()))
        .slice(0, 10)
        .map(({ q, score, reasons }) => ({
          quoteId: q.id,
          createdAt: q.createdAt,
          status: q.status,
          customerName: q.customerName,
          package: { id: q.packageId, name: q.package.name },
          quantity: q.quantity,
          discountPercent: Number(q.discountPercent),
          addOns: q.addOns.map((a) => ({ id: a.id, name: a.name })),
          paymentKind: q.paymentKind,
          netDays: q.netDays,
          prepayPercent: q.prepayPercent != null ? Number(q.prepayPercent) : null,
          subtotal: Number(q.subtotal),
          total: Number(q.total),
          similarity: { score, reasons },
        }));

      return { status: "ok", results: ranked } as const;
    }),

  /**
   * Create a new quote from structured inputs, resolve package/add-ons, compute pricing, and
   * generate an HTML contract. Falls back to a local template if no LLM is available.
   */
  createQuote: publicProcedure
    .input(
      z.object({
        packageId: z.string().optional(),
        productName: z.string().optional(),
        seats: z.number().int().positive(),
        discountPercent: z.number().min(0).max(100).default(0),
        addOnIds: z.array(z.string()).optional().default([]),
        addOnNames: z.array(z.string()).optional(),
        customerName: z.string(),
        paymentKind: z.nativeEnum(PaymentKind).default(PaymentKind.NET),
        netDays: z.number().int().positive().optional(),
        prepayPercent: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sessionUserId = ctx.session?.user?.id ?? null;
      const createdBy = sessionUserId
        ? await ctx.db.user.findUnique({ where: { id: sessionUserId } })
        : await ctx.db.user.findFirst();
      if (!createdBy) {
        return { status: "error", error: { code: "no_user", message: "No user available to assign as quote creator." } } as const;
      }

      const orgId = createdBy.orgId ?? (await ctx.db.org.findFirst())?.id;
      if (!orgId) {
        return { status: "error", error: { code: "no_org", message: "No organisation found to assign to the new quote." } } as const;
      }

      let pkg = null as null | { id: string; name: string; unitPrice: Prisma.Decimal };
      if (input.packageId) {
        pkg = await ctx.db.package.findFirst({ where: { id: input.packageId, orgId } });
      } else if (input.productName) {
        const name = input.productName.trim();
        const candidates = await ctx.db.package.findMany({ where: { orgId } });
        const exact = candidates.find((p) => p.name.toLowerCase() === name.toLowerCase());
        const contains = exact ?? candidates.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));
        pkg = contains ?? null;
      }

      if (!pkg) {
        return { status: "error", error: { code: "package_not_found", message: "Could not resolve package. Provide a valid packageId or productName." } } as const;
      }

      const addOnIdSet = new Set(input.addOnIds ?? []);
      if (input.addOnNames && input.addOnNames.length > 0) {
        const allAddOns = await ctx.db.addOn.findMany({ where: { orgId } });
        const lowerNames = input.addOnNames.map((n) => n.trim().toLowerCase());
        for (const ao of allAddOns) {
          if (lowerNames.some((n) => ao.name.toLowerCase().includes(n))) {
            addOnIdSet.add(ao.id);
          }
        }
      }
      const addOnIds = Array.from(addOnIdSet);
      const addOns = addOnIds.length
        ? await ctx.db.addOn.findMany({ where: { id: { in: addOnIds }, orgId } })
        : [];

      if (input.paymentKind === PaymentKind.NET) {
        if (input.netDays == null) {
          return { status: "error", error: { code: "validation_error", message: "netDays is required when paymentKind is NET." } } as const;
        }
      } else if (input.paymentKind === PaymentKind.PREPAY) {
      } else if (input.paymentKind === PaymentKind.BOTH) {
        if (input.netDays == null || input.prepayPercent == null) {
          return { status: "error", error: { code: "validation_error", message: "netDays and prepayPercent are required when paymentKind is BOTH." } } as const;
        }
      }

      const seats = input.seats;
      const discountPctNum = input.discountPercent ?? 0;
      const packageUnit = Number(pkg.unitPrice);
      const addOnSum = addOns.reduce((acc, ao) => acc + Number(ao.unitPrice), 0);
      const subtotalNum = packageUnit * seats + addOnSum;
      const totalNum = subtotalNum * (1 - discountPctNum / 100);
      const toCurrency = (n: number) => Number(n.toFixed(2));

      const quote = await ctx.db.quote.create({
        data: {
          orgId,
          createdById: createdBy.id,
          packageId: pkg.id,
          quantity: seats,
          customerName: input.customerName,
          paymentKind: input.paymentKind,
          netDays: input.paymentKind !== PaymentKind.PREPAY ? input.netDays ?? null : null,
          prepayPercent:
            input.paymentKind !== PaymentKind.NET
              ? (input.prepayPercent != null ? new Prisma.Decimal(input.prepayPercent) : new Prisma.Decimal(100))
              : null,
          subtotal: new Prisma.Decimal(toCurrency(subtotalNum)),
          discountPercent: new Prisma.Decimal(discountPctNum),
          total: new Prisma.Decimal(toCurrency(totalNum)),
          status: QuoteStatus.Pending,
          addOns: addOns.length ? { connect: addOns.map((a) => ({ id: a.id })) } : undefined,
        },
      });

      const contractInput = {
        quoteId: quote.id,
        customerName: quote.customerName,
        productName: pkg.name,
        seats,
        addOns: addOns.map((a) => a.name),
        subtotal: toCurrency(subtotalNum),
        discountPercent: discountPctNum,
        total: toCurrency(totalNum),
        paymentKind: input.paymentKind,
        netDays: input.netDays ?? null,
        prepayPercent: input.prepayPercent ?? (input.paymentKind === PaymentKind.PREPAY ? 100 : null),
        createdAt: quote.createdAt,
      };

    
      async function generateContract(ci: typeof contractInput): Promise<string | null> {
        try {
          const apiKey = env.OPENAI_KEY;
          if (!apiKey) return null;
          const prompt = `Create a concise, professional SaaS order form as minimal HTML only (no markdown). Include: Quote ID ${ci.quoteId}, Customer ${ci.customerName}, Package ${ci.productName} x ${ci.seats} seats, Add-ons ${ci.addOns.join(", ") || "None"}, Subtotal $${ci.subtotal.toFixed ? ci.subtotal.toFixed(2) : ci.subtotal}, Discount ${ci.discountPercent}%, Total $${ci.total.toFixed ? ci.total.toFixed(2) : ci.total}, Payment ${ci.paymentKind}${ci.netDays ? ", Net " + ci.netDays + " days" : ""}${ci.prepayPercent ? ", Prepay " + ci.prepayPercent + "%" : ""}. Use simple inline styles, and headings for sections.`;

          const responsesRes = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              input: prompt,
              temperature: 0.3,
            }),
          });
          if (responsesRes.ok) {
            const data = (await responsesRes.json()) as any;
            const out = data?.output_text ?? data?.content?.[0]?.text ?? null;
            if (out && typeof out === "string") return out.trim();
          }

          const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: "You generate short, production-ready HTML contracts. Output raw HTML only." },
                { role: "user", content: prompt },
              ],
              temperature: 0.3,
            }),
          });
          if (chatRes.ok) {
            const data = (await chatRes.json()) as any;
            const out = data?.choices?.[0]?.message?.content ?? null;
            if (out && typeof out === "string") return out.trim();
          }
        } catch {}
        return null;
      }

      const contractText = await generateContract(contractInput);

      await ctx.db.quote.update({ where: { id: quote.id }, data: { documentHtml: contractText } });

      function buildApprovalChain(discountPercent: number, paymentKind: PaymentKind, netDays: number | null): Role[] {
        const roles: Role[] = [Role.AE];
        if (discountPercent > 0 && discountPercent <= 15) {
          roles.push(Role.DEALDESK);
        } else if (discountPercent > 15 && discountPercent <= 40) {
          roles.push(Role.CRO);
        } else if (
          discountPercent > 40 ||
          paymentKind === PaymentKind.BOTH ||
          (paymentKind === PaymentKind.NET && (netDays ?? 0) >= 60)
        ) {
          roles.push(Role.FINANCE);
        }
        roles.push(Role.LEGAL);
        return roles;
      }

      const chain = buildApprovalChain(discountPctNum, input.paymentKind, input.netDays ?? null);
      await ctx.db.$transaction(async (tx) => {
        const existingWf = await tx.approvalWorkflow.findUnique({ where: { quoteId: quote.id } });
        const workflowId = existingWf?.id ?? (await tx.approvalWorkflow.create({ data: { quoteId: quote.id } })).id;

        await tx.approvalStep.deleteMany({ where: { approvalWorkflowId: workflowId } });

        const approverId = createdBy.id ?? null;
        await tx.approvalStep.create({
          data: {
            approvalWorkflowId: workflowId,
            stepOrder: 1,
            persona: Role.AE,
            approverId,
            status: ApprovalStatus.Approved,
            approvedAt: new Date(),
          },
        });

        let order = 2;
        for (const persona of chain.slice(1)) {
          await tx.approvalStep.create({
            data: {
              approvalWorkflowId: workflowId,
              stepOrder: order,
              persona,
              status: ApprovalStatus.Waiting,
            },
          });
          order += 1;
        }

        await recomputeWorkflowGating(tx, quote.id);
        await updateQuoteStatus(tx, quote.id);
      });

      return {
        status: "ok",
        quoteId: quote.id,
        contractGenerated: Boolean(contractText),
        package: { id: pkg.id, name: pkg.name },
        seats,
        addOnCount: addOns.length,
        pricing: {
          subtotal: toCurrency(subtotalNum),
          discountPercent: discountPctNum,
          total: toCurrency(totalNum),
        },
      } as const;
    }),
});
