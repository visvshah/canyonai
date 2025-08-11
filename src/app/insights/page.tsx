"use client";

import { api } from "~/trpc/react";
import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  LinearProgress,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Stack,
  Button,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import BlockIcon from "@mui/icons-material/Block";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ExtensionIcon from "@mui/icons-material/Extension";

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

function KpiCard(props: { title: string; value: string | number; color?: string; icon?: React.ReactNode }) {
  const { title, value, color, icon } = props;
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="center">
          {icon ? (
            <Avatar sx={{ bgcolor: color ?? "primary.main", width: 44, height: 44 }}>{icon}</Avatar>
          ) : null}
          <Box>
            <Typography variant="overline" color="text.secondary">{title}</Typography>
            <Typography variant="h5" fontWeight={700}>{value}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SegmentedBar({ segments }: { segments: Array<{ label: string; value: number; color: string }> }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <Box>
      <Box display="flex" width="100%" height={10} borderRadius={5} overflow="hidden" sx={{ outline: "1px solid", outlineColor: "divider" }}>
        {segments.map((s) => (
          <Box key={s.label} sx={{ width: `${(s.value / total) * 100}%`, bgcolor: s.color }} />
        ))}
      </Box>
      <Box mt={1} display="flex" gap={1} flexWrap="wrap">
        {segments.map((s) => (
          <Chip key={s.label} size="small" label={`${s.label}: ${s.value.toFixed(1)}%`} sx={{ bgcolor: "transparent", borderColor: "divider" }} variant="outlined" />
        ))}
      </Box>
    </Box>
  );
}

function BreakdownTable({ items, dense = true, initialLimit = 8 }: { items: Array<{ id: string; name: string; value: number }>; dense?: boolean; initialLimit?: number }) {
  const [limit, setLimit] = useState<number>(initialLimit);
  const shown = items.slice(0, limit);
  const hasMore = items.length > limit;
  const total = items.reduce((a, it) => a + it.value, 0);
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Total: {formatCurrency(total)}
      </Typography>
      <Table size={dense ? "small" : "medium"} sx={{ "& td, & th": { border: 0, py: 0.5 } }}>
        <TableBody>
          {shown.map((it) => (
            <TableRow key={it.id} hover>
              <TableCell sx={{ pl: 0 }}>{it.name}</TableCell>
              <TableCell align="right" sx={{ pr: 0, whiteSpace: "nowrap" }}>{formatCurrency(it.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasMore && (
        <Box mt={1} display="flex" justifyContent="flex-end">
          <Button size="small" onClick={() => setLimit(items.length)}>Show all</Button>
        </Box>
      )}
    </Box>
  );
}

export default function InsightsPage() {
  const { data, isLoading } = api.insights.overview.useQuery();

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [breakdownTab, setBreakdownTab] = useState<0 | 1>(0);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedSinceSnapshotMs = useMemo(() => {
    if (!data) return 0;
    const generatedAt = new Date(data.snapshot.generatedAt).getTime();
    return Math.max(0, nowMs - generatedAt);
  }, [data, nowMs]);

  const outcomeSegments = useMemo(() => {
    if (!data) return [] as Array<{ label: string; value: number; color: string }>;
    const o = data.outcomePercentages;
    return [
      { label: "Approved", value: o.approvedPct, color: "success.main" },
      { label: "Pending", value: o.pendingPct, color: "warning.main" },
      { label: "Rejected", value: o.rejectedPct, color: "error.main" },
      { label: "Sold", value: o.soldPct, color: "info.main" },
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
          {/* KPI Row */}
          <Box display="grid" gap={2} sx={{ gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" } }}>
            <KpiCard title="Total Quotes" value={data.totals.totalQuotes} color="primary.main" icon={<TrendingUpIcon />} />
            <KpiCard title="Approved" value={data.totals.totalApproved} color="success.main" icon={<CheckCircleOutlineIcon />} />
            <KpiCard title="Rejected" value={data.totals.totalRejected} color="error.main" icon={<BlockIcon />} />
            <KpiCard title="Pending" value={data.totals.totalPending} color="warning.main" icon={<HourglassBottomIcon />} />
          </Box>

          {/* Outcome Mix */}
          <Card variant="outlined">
            <CardHeader title="Outcome Mix" />
            <CardContent>
              <SegmentedBar segments={outcomeSegments} />
            </CardContent>
          </Card>

          {/* Quotes by Stage */}
          <Card variant="outlined">
            <CardHeader title="Quotes by Stage (Next Approver Persona)" />
            <CardContent>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Persona</TableCell>
                    <TableCell align="right">Count</TableCell>
                    <TableCell align="right">Avg Wait</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(data.quotesByStage).map(([persona, count]) => {
                    const personaKey = persona as keyof typeof data.avgPendingWaitMsByPersona;
                    const baseAvgWait = data.avgPendingWaitMsByPersona[personaKey];
                    const avgWait = baseAvgWait != null ? baseAvgWait + elapsedSinceSnapshotMs : null;
                    return (
                      <TableRow key={persona} hover>
                        <TableCell>{persona}</TableCell>
                        <TableCell align="right">{count as number}</TableCell>
                        <TableCell align="right">{formatMsToHuman(avgWait)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Timing */}
          <Card variant="outlined">
            <CardHeader title="Approval Timing" />
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

          {/* Value + Discount */}
          <Box display="grid" gap={2} sx={{ gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
            <Card variant="outlined">
              <CardHeader title="Value by Status" />
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="success.light">Approved</Typography>
                    <Typography>{formatCurrency(data.totals.totalValueApproved)}</Typography>
                  </Stack>
                  <Divider />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="info.light">Sold</Typography>
                    <Typography>{formatCurrency(data.totals.totalValueSold)}</Typography>
                  </Stack>
                  <Divider />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="warning.light">Pending</Typography>
                    <Typography>{formatCurrency(data.totals.totalValuePending)}</Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardHeader title="Discount Insights" />
              <CardContent>
                <Box display="grid" gap={1} sx={{ gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary">Avg Discount (All)</Typography>
                    <Typography variant="h6">{data.discountStats.avgDiscountOverall?.toFixed(1) ?? "—"}%</Typography>
                  </Box>
                  <Box>
                    <Typography variant="overline" color="text.secondary">Avg Discount (Approved)</Typography>
                    <Typography variant="h6">{data.discountStats.avgDiscountApproved?.toFixed(1) ?? "—"}%</Typography>
                  </Box>
                  <Box>
                    <Typography variant="overline" color="text.secondary">Avg Discount (Rejected)</Typography>
                    <Typography variant="h6">{data.discountStats.avgDiscountRejected?.toFixed(1) ?? "—"}%</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Breakdowns */}
          <Card variant="outlined">
            <CardHeader title="Breakdowns" />
            <CardContent>
              <Tabs value={breakdownTab} onChange={(_, v) => setBreakdownTab(v)} sx={{ mb: 2 }}>
                <Tab icon={<Inventory2Icon />} iconPosition="start" label="By Package" />
                <Tab icon={<ExtensionIcon />} iconPosition="start" label="By Add-on" />
              </Tabs>

              {breakdownTab === 0 && (
                <Box display="grid" gap={3} sx={{ gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
                  {(["Approved", "Sold", "Pending", "Rejected"] as const).map((statusKey) => (
                    <Box key={statusKey}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>{statusKey}</Typography>
                      {data.valueBreakdown?.byPackage?.[statusKey]?.length ? (
                        <BreakdownTable items={data.valueBreakdown.byPackage[statusKey]} />
                      ) : (
                        <Typography variant="body2" color="text.secondary">No data</Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}

              {breakdownTab === 1 && (
                <Box display="grid" gap={3} sx={{ gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
                  {(["Approved", "Sold", "Pending", "Rejected"] as const).map((statusKey) => (
                    <Box key={statusKey}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>{statusKey}</Typography>
                      {data.valueBreakdown?.byAddOn?.[statusKey]?.length ? (
                        <BreakdownTable items={data.valueBreakdown.byAddOn[statusKey]} />
                      ) : (
                        <Typography variant="body2" color="text.secondary">No data</Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

