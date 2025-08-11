import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { QuoteStatus, Role, ApprovalStatus } from "@prisma/client";

type Millis = number;

function toSafeNumber(n: any): number {
  const num = typeof n === "number" ? n : Number(n);
  return Number.isFinite(num) ? num : 0;
}

export const insightsRouter = createTRPCRouter({
  overview: publicProcedure.query(async ({ ctx }) => {
    const quotes = await ctx.db.quote.findMany({
      include: {
        approvalWorkflow: {
          include: {
            steps: { orderBy: { stepOrder: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const pipelineByStatus: Record<QuoteStatus, number> = {
      [QuoteStatus.Pending]: 0,
      [QuoteStatus.Approved]: 0,
      [QuoteStatus.Rejected]: 0,
      [QuoteStatus.Sold]: 0,
    };

    const quotesByStage: Record<Role, number> = {
      [Role.AE]: 0,
      [Role.DEALDESK]: 0,
      [Role.CRO]: 0,
      [Role.LEGAL]: 0,
      [Role.FINANCE]: 0,
    };

    const pendingWaitAgg: Record<Role, { totalMs: Millis; count: number }> = {
      [Role.AE]: { totalMs: 0, count: 0 },
      [Role.DEALDESK]: { totalMs: 0, count: 0 },
      [Role.CRO]: { totalMs: 0, count: 0 },
      [Role.LEGAL]: { totalMs: 0, count: 0 },
      [Role.FINANCE]: { totalMs: 0, count: 0 },
    };

    const personaDurations: Record<Role, { totalMs: Millis; count: number }> = {
      [Role.AE]: { totalMs: 0, count: 0 },
      [Role.DEALDESK]: { totalMs: 0, count: 0 },
      [Role.CRO]: { totalMs: 0, count: 0 },
      [Role.LEGAL]: { totalMs: 0, count: 0 },
      [Role.FINANCE]: { totalMs: 0, count: 0 },
    };

    let fullApprovalTotalMs = 0;
    let fullApprovalCount = 0;

    let totalQuotes = 0;
    let totalApproved = 0;
    let totalRejected = 0;
    let totalPending = 0;
    let totalSold = 0;

    let totalValueApproved = 0;
    let totalValuePending = 0;
    let totalValueSold = 0;

    let sumDiscountAll = 0;
    let countDiscountAll = 0;
    let sumDiscountApproved = 0;
    let countDiscountApproved = 0;
    let sumDiscountRejected = 0;
    let countDiscountRejected = 0;

    const now = new Date();
    for (const q of quotes) {
      totalQuotes += 1;
      pipelineByStatus[q.status] += 1;
      const discount = toSafeNumber(q.discountPercent);
      sumDiscountAll += discount;
      countDiscountAll += 1;

      if (q.status === QuoteStatus.Approved) {
        totalApproved += 1;
        totalValueApproved += toSafeNumber(q.total);
        sumDiscountApproved += discount;
        countDiscountApproved += 1;
      } else if (q.status === QuoteStatus.Rejected) {
        totalRejected += 1;
        sumDiscountRejected += discount;
        countDiscountRejected += 1;
      } else if (q.status === QuoteStatus.Pending) {
        totalPending += 1;
        totalValuePending += toSafeNumber(q.total);
      } else if (q.status === QuoteStatus.Sold) {
        totalSold += 1;
        totalValueSold += toSafeNumber(q.total);
      }

      const steps = q.approvalWorkflow?.steps ?? [];

      if (q.status === QuoteStatus.Pending) {
        const pendingIndex = steps.findIndex((s) => s.status === ApprovalStatus.Pending);
        if (pendingIndex >= 0) {
          const pendingStep = steps[pendingIndex]!;
          quotesByStage[pendingStep.persona] += 1;

          let lastPrevApprovedAt: Date | null = null;
          for (let j = pendingIndex - 1; j >= 0; j--) {
            const prev = steps[j]!;
            if (prev.status === ApprovalStatus.Approved && prev.approvedAt) {
              lastPrevApprovedAt = prev.approvedAt;
              break;
            }
          }
          const candidates: Date[] = [];
          if (pendingStep.updatedAt) candidates.push(pendingStep.updatedAt);
          if (pendingStep.createdAt) candidates.push(pendingStep.createdAt);
          if (lastPrevApprovedAt) candidates.push(lastPrevApprovedAt);
          if (q.updatedAt) candidates.push(q.updatedAt);
          candidates.push(q.createdAt);
          const waitStart = new Date(Math.max(...candidates.map((d) => d.getTime())));
          const waitMs = Math.max(0, now.getTime() - waitStart.getTime());
          const agg = pendingWaitAgg[pendingStep.persona];
          agg.totalMs += waitMs;
          agg.count += 1;
        }
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        if ((step.status === ApprovalStatus.Approved || step.status === ApprovalStatus.Rejected) && step.approvedAt) {
          const start = step.updatedAt ?? q.createdAt;
          const end = step.approvedAt;
          const ms = Math.max(0, end.getTime() - start.getTime());
          const agg = personaDurations[step.persona];
          agg.totalMs += ms;
          agg.count += 1;
          if (step.status === ApprovalStatus.Rejected) {
            break;
          }
        }
      }

      if (steps.length > 0 && steps.every((s) => s.status === "Approved") && steps[steps.length - 1]?.approvedAt) {
        const lastApprovedAt = steps[steps.length - 1]!.approvedAt!;
        const ms = Math.max(0, lastApprovedAt.getTime() - q.createdAt.getTime());
        fullApprovalTotalMs += ms;
        fullApprovalCount += 1;
      }
    }

    const outcomeDenominator = Math.max(1, totalQuotes);
    const outcomePercentages = {
      approvedPct: (totalApproved / outcomeDenominator) * 100,
      rejectedPct: (totalRejected / outcomeDenominator) * 100,
      pendingPct: (totalPending / outcomeDenominator) * 100,
      soldPct: (totalSold / outcomeDenominator) * 100,
    };

    const avgApprovalTimePerPersona: Record<Role, Millis | null> = {
      [Role.AE]: personaDurations[Role.AE].count ? personaDurations[Role.AE].totalMs / personaDurations[Role.AE].count : null,
      [Role.DEALDESK]: personaDurations[Role.DEALDESK].count ? personaDurations[Role.DEALDESK].totalMs / personaDurations[Role.DEALDESK].count : null,
      [Role.CRO]: personaDurations[Role.CRO].count ? personaDurations[Role.CRO].totalMs / personaDurations[Role.CRO].count : null,
      [Role.LEGAL]: personaDurations[Role.LEGAL].count ? personaDurations[Role.LEGAL].totalMs / personaDurations[Role.LEGAL].count : null,
      [Role.FINANCE]: personaDurations[Role.FINANCE].count ? personaDurations[Role.FINANCE].totalMs / personaDurations[Role.FINANCE].count : null,
    };

    const avgPendingWaitMsByPersona: Record<Role, Millis | null> = {
      [Role.AE]: pendingWaitAgg[Role.AE].count ? pendingWaitAgg[Role.AE].totalMs / pendingWaitAgg[Role.AE].count : null,
      [Role.DEALDESK]: pendingWaitAgg[Role.DEALDESK].count ? pendingWaitAgg[Role.DEALDESK].totalMs / pendingWaitAgg[Role.DEALDESK].count : null,
      [Role.CRO]: pendingWaitAgg[Role.CRO].count ? pendingWaitAgg[Role.CRO].totalMs / pendingWaitAgg[Role.CRO].count : null,
      [Role.LEGAL]: pendingWaitAgg[Role.LEGAL].count ? pendingWaitAgg[Role.LEGAL].totalMs / pendingWaitAgg[Role.LEGAL].count : null,
      [Role.FINANCE]: pendingWaitAgg[Role.FINANCE].count ? pendingWaitAgg[Role.FINANCE].totalMs / pendingWaitAgg[Role.FINANCE].count : null,
    };

    const avgTimeToFullApprovalMs = fullApprovalCount ? fullApprovalTotalMs / fullApprovalCount : null;

    const discountStats = {
      avgDiscountOverall: countDiscountAll ? sumDiscountAll / countDiscountAll : null,
      avgDiscountApproved: countDiscountApproved ? sumDiscountApproved / countDiscountApproved : null,
      avgDiscountRejected: countDiscountRejected ? sumDiscountRejected / countDiscountRejected : null,
    } as const;

    return {
      snapshot: { generatedAt: now },
      totals: {
        totalQuotes,
        totalApproved,
        totalRejected,
        totalPending,
        totalSold,
        totalValueApproved,
        totalValuePending,
        totalValueSold,
      },
      pipelineByStatus,
      quotesByStage,
      outcomePercentages,
      avgApprovalTimePerPersona,
      avgPendingWaitMsByPersona,
      avgTimeToFullApprovalMs,
      discountStats,
    } as const;
  }),
});


