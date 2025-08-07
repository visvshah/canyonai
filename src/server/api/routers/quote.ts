import { z } from "zod";
import { Prisma } from "@prisma/client";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

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
   * Delete an approval step from a quote's workflow.
   * 1. Remove the step
   * 2. Re-order remaining steps so they are sequential starting at 1
   * 3. If no steps remain, mark the quote as Approved and remove the workflow record
   */
  deleteApprovalStep: publicProcedure
    .input(z.object({ stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { stepId } = input;

      // Fetch the step with its workflow + quote information
      const step = await ctx.db.approvalStep.findUnique({
        where: { id: stepId },
        include: {
          approvalWorkflow: {
            include: {
              quote: true,
              steps: true,
            },
          },
        },
      });

      if (!step) {
        throw new Error("Approval step not found");
      }

      const workflow = step.approvalWorkflow;

      // Delete the step first
      await ctx.db.approvalStep.delete({ where: { id: stepId } });

      // Re-fetch remaining steps ordered by stepOrder ASC
      const remainingSteps = await ctx.db.approvalStep.findMany({
        where: { approvalWorkflowId: workflow.id },
        orderBy: { stepOrder: "asc" },
      });

      // If no steps remain → mark quote Approved and delete the workflow entirely
      if (remainingSteps.length === 0) {
        await ctx.db.$transaction([
          ctx.db.quote.update({
            where: { id: workflow.quoteId },
            data: { status: "Approved" },
          }),
        ]);
        return { success: true };
      }

      // Otherwise, renumber remaining steps (1-based)
      await ctx.db.$transaction(
        remainingSteps.map((s, idx) =>
          ctx.db.approvalStep.update({
            where: { id: s.id },
            data: { stepOrder: idx + 1 },
          }),
        ),
      );

      // If after deletion all steps are Approved or Skipped, mark quote Approved
      const anyPending = remainingSteps.some((s) => s.status === "Pending");
      if (!anyPending) {
        await ctx.db.quote.update({
          where: { id: workflow.quoteId },
          data: { status: "Approved" },
        });
      }

      return { success: true };
    }),
});
