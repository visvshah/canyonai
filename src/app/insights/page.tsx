"use client";

import { api } from "~/trpc/react";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, Typography, Chip, LinearProgress, Box, Tooltip } from "@mui/material";

function formatMsToHuman(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatCurrency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export default function InsightsPage() {
  const { data, isLoading } = api.insights.overview.useQuery();

  const outcome = useMemo(() => {
    if (!data) return null;
    const { outcomePercentages } = data;
    return [
      { label: "Approved", value: outcomePercentages.approvedPct, color: "success" as const },
      { label: "Pending", value: outcomePercentages.pendingPct, color: "warning" as const },
      { label: "Rejected", value: outcomePercentages.rejectedPct, color: "error" as const },
      { label: "Sold", value: outcomePercentages.soldPct, color: "info" as const },
    ];
  }, [data]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
      <Typography variant="h4" fontWeight={700}>Insights</Typography>

      {isLoading ? (
        <LinearProgress />
      ) : !data ? (
        <Typography>Unable to load insights.</Typography>
      ) : (
        <>
          {/* Top KPI cards */}
          <Box display="grid" gap={2} sx={{ gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" } }}>
            <Card variant="outlined">
              <CardHeader title="Total Quotes" />
              <CardContent>
                <Typography variant="h5">{data.totals.totalQuotes}</Typography>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardHeader title="Approved" />
              <CardContent>
                <Typography variant="h5">{data.totals.totalApproved}</Typography>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardHeader title="Rejected" />
              <CardContent>
                <Typography variant="h5">{data.totals.totalRejected}</Typography>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardHeader title="Pending" />
              <CardContent>
                <Typography variant="h5">{data.totals.totalPending}</Typography>
              </CardContent>
            </Card>
          </Box>

          {/* Outcome percentages */}
          <Card variant="outlined">
            <CardHeader title="Outcome Mix" />
            <CardContent>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {outcome?.map((o) => (
                  <Chip key={o.label} label={`${o.label}: ${o.value.toFixed(1)}%`} color={o.color} variant="outlined" />
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* Quotes by stage with avg pending wait */}
          <Card variant="outlined">
            <CardHeader title="Quotes by Stage (Next Approver Persona)" />
            <CardContent>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {Object.entries(data.quotesByStage).map(([persona, count]) => {
                  const avgWait = (data.avgPendingWaitMsByPersona as any)[persona] as number | null;
                  return (
                    <Chip key={persona} label={`${persona}: ${count as number} · avg wait ${formatMsToHuman(avgWait)}`} variant="outlined" />
                  );
                })}
              </Box>
            </CardContent>
          </Card>

          {/* Avg approval time per persona */}
          <Card variant="outlined">
            <CardHeader title="Avg. Approval Time per Persona" />
            <CardContent>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {Object.entries(data.avgApprovalTimePerPersona).map(([persona, ms]) => (
                  <Chip key={persona} label={`${persona}: ${formatMsToHuman(ms as number | null)}`} />
                ))}
              </Box>
              <Box mt={1}>
                <Tooltip title="Average time from submission to final approval for fully approved workflows">
                  <Typography variant="body2" color="text.secondary">
                    Time to Full Approval: {formatMsToHuman(data.avgTimeToFullApprovalMs)}
                  </Typography>
                </Tooltip>
              </Box>
            </CardContent>
          </Card>

          {/* Value by status & discount insights */}
          <Box display="grid" gap={2} sx={{ gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
            <Card variant="outlined">
              <CardHeader title="Value by Status" />
              <CardContent>
                <Typography>Approved/Sold: {formatCurrency(data.totals.totalValueApproved)}</Typography>
                <Typography>Pending: {formatCurrency(data.totals.totalValuePending)}</Typography>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardHeader title="Discount Insights" />
              <CardContent>
                <Typography>Avg Discount (All): {data.discountStats.avgDiscountOverall?.toFixed(1) ?? "—"}%</Typography>
                <Typography>Avg Discount (Approved): {data.discountStats.avgDiscountApproved?.toFixed(1) ?? "—"}%</Typography>
                <Typography>Avg Discount (Rejected): {data.discountStats.avgDiscountRejected?.toFixed(1) ?? "—"}%</Typography>
              </CardContent>
            </Card>
          </Box>
        </>
      )}
    </div>
  );
}

