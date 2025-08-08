import { z } from "zod";
import { Prisma, Role, ApprovalStatus, QuoteStatus } from "@prisma/client";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// Centralized status updater: computes Quote.status from its workflow steps
// Rules:
// - Any step Rejected => Quote Rejected
// - Else any step Pending => Quote Pending
// - Else (all Approved or Skipped, or no steps) => Quote Approved
const updateQuoteStatus = async (
  tx: Prisma.TransactionClient,
  quoteId: string,
) => {
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

export const quoteRouter = createTRPCRouter({
  /**
   * Fetch all quotes. Optionally filter by a search string that matches the
   * customer name or organisation name (case-insensitive, partial match).
   */
  all: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const containsKeyword = (value: string) => ({
        contains: value,
        mode: "insensitive" as const,
      });

      const where: Prisma.QuoteWhereInput = input?.search
        ? {
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
          }
        : {};

      return ctx.db.quote.findMany({
        where,
        include: {
          org: true,
          package: true,
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
        // Ensure workflow exists
        const existing = await tx.approvalWorkflow.findUnique({
          where: { quoteId },
          include: { steps: true },
        });
        const workflowId = existing
          ? existing.id
          : (await tx.approvalWorkflow.create({ data: { quoteId } })).id;

        // Delete existing steps
        await tx.approvalStep.deleteMany({ where: { approvalWorkflowId: workflowId } });

        // Insert new steps in order
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
              status: s.status ?? ApprovalStatus.Pending,
            },
          });
        }

        // Update quote status based on new workflow
        await updateQuoteStatus(tx, quoteId);
      });
      return { success: true };
    }),
});
