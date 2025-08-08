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
   * Add a workflow step at a given position and recompute quote status.
   */
  addWorkflowStep: publicProcedure
    .input(
      z.object({
        quoteId: z.string(),
        persona: z.nativeEnum(Role),
        approverEmail: z.string().email().optional(),
        position: z.number().int().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { quoteId, persona, approverEmail, position } = input;

      const quote = await ctx.db.quote.findUnique({
        where: { id: quoteId },
        include: { approvalWorkflow: { include: { steps: true } } },
      });

      if (!quote) throw new Error("Quote not found");

      await ctx.db.$transaction(async (tx) => {
        // Ensure workflow exists
        let workflowId = quote.approvalWorkflow?.id ?? null;
        if (!workflowId) {
          const wf = await tx.approvalWorkflow.create({ data: { quoteId } });
          workflowId = wf.id;
        }

        const currentCount = quote.approvalWorkflow?.steps.length ?? 0;
        const pos = Math.min(Math.max(position, 1), currentCount + 1);

        // Shift later steps down by 1
        await tx.approvalStep.updateMany({
          where: { approvalWorkflowId: workflowId!, stepOrder: { gte: pos } },
          data: { stepOrder: { increment: 1 } },
        });

        // Resolve approver by email if provided
        let approverId: string | null = null;
        if (approverEmail) {
          const user = await tx.user.findUnique({ where: { email: approverEmail } });
          approverId = user?.id ?? null;
        }

        // Create the new step
        await tx.approvalStep.create({
          data: {
            approvalWorkflowId: workflowId!,
            stepOrder: pos,
            persona,
            approverId,
            status: ApprovalStatus.Pending,
          },
        });

        // Recompute status centrally
        await updateQuoteStatus(tx, quoteId);
      });

      return { success: true };
    }),

  /**
   * Remove a workflow step and recompute quote status.
   */
  removeWorkflowStep: publicProcedure
    .input(z.object({ stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { stepId } = input;

      await ctx.db.$transaction(async (tx) => {
        const step = await tx.approvalStep.findUnique({
          where: { id: stepId },
          include: { approvalWorkflow: true },
        });
        if (!step) throw new Error("Approval step not found");

        const workflowId = step.approvalWorkflowId;
        const quoteId = step.approvalWorkflow.quoteId;

        // Delete the step
        await tx.approvalStep.delete({ where: { id: stepId } });

        // Reorder remaining steps 1..n
        const remaining = await tx.approvalStep.findMany({
          where: { approvalWorkflowId: workflowId },
          orderBy: { stepOrder: "asc" },
        });
        for (let i = 0; i < remaining.length; i++) {
          const s = remaining[i]!;
          if (s.stepOrder !== i + 1) {
            await tx.approvalStep.update({ where: { id: s.id }, data: { stepOrder: i + 1 } });
          }
        }

        // Centralized status update
        await updateQuoteStatus(tx, quoteId);
      });

      return { success: true };
    }),

  /**
   * Edit a workflow step: change persona, status, or approver (via email), then recompute quote status.
   */
  editWorkflowStep: publicProcedure
    .input(
      z
        .object({
          stepId: z.string(),
          persona: z.nativeEnum(Role).optional(),
          status: z.nativeEnum(ApprovalStatus).optional(),
          approverEmail: z.string().email().optional(),
        })
        .refine((data) => Boolean(data.persona ?? data.status ?? data.approverEmail), {
          message: "At least one field to update must be provided",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(async (tx) => {
        const step = await tx.approvalStep.findUnique({
          where: { id: input.stepId },
          include: { approvalWorkflow: true },
        });
        if (!step) throw new Error("Approval step not found");

        let approverId: string | null | undefined = undefined; // undefined means don't change
        if (input.approverEmail !== undefined) {
          if (input.approverEmail === "") {
            approverId = null; // clear
          } else {
            const user = await tx.user.findUnique({ where: { email: input.approverEmail } });
            approverId = user?.id ?? null;
          }
        }

        await tx.approvalStep.update({
          where: { id: input.stepId },
          data: {
            persona: input.persona ?? step.persona,
            status: input.status ?? step.status,
            ...(approverId !== undefined ? { approverId } : {}),
          },
        });

        await updateQuoteStatus(tx, step.approvalWorkflow.quoteId);
      });

      return { success: true };
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
