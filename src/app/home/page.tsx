"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { Role } from "@prisma/client";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Divider,
  Card,
  CardContent,
  CardHeader,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import InsightsIcon from "@mui/icons-material/Insights";
import { format } from "date-fns";

function formatCurrency(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value ?? "—");
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `$${num.toFixed(2)}`;
  }
}

function formatPercent(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value ?? "—");
  return `${num.toFixed(1)}%`;
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roles = useMemo(() => Object.values(Role) as readonly Role[], []);
  const [selectedRole, setSelectedRole] = useState<Role>(roles[1] ?? roles[0]!); // default a bit more realistic for Zoom: Deal Desk

  // Persist role from query param
  useEffect(() => {
    const r = searchParams?.get("role");
    if (!r) return;
    if ((roles as readonly string[]).includes(r)) {
      setSelectedRole(r as Role);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const utils = api.useUtils();

  // Insights overview for KPI tiles
  const { data: insights, isLoading: insightsLoading } = api.insights.overview.useQuery();

  // Approval queue for selected role
  const {
    data: queue,
    isLoading: queueLoading,
    refetch: refetchQueue,
  } = api.quote.pendingByRole.useQuery(
    { role: selectedRole },
    { staleTime: 0 },
  );

  // No recent quotes section per design simplification

  const approveMutation = api.quote.approveNextForRole.useMutation({
    onSuccess: async () => {
      await utils.quote.pendingByRole.invalidate({ role: selectedRole });
    },
  });

  const handleApprove = async (quoteId: string) => {
    await approveMutation.mutateAsync({ quoteId, role: selectedRole });
  };

  return (
    <main>
      {/* Hero / Zoom banner */}
      <Box
        sx={{
          p: { xs: 3, md: 4 },
          background: (t) =>
            `linear-gradient(135deg, ${t.palette.primary.main}22 0%, ${t.palette.secondary.main}22 50%, transparent 100%)`,
          borderBottom: (t) => `1px solid ${t.palette.divider}`,
        }}
      >
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} spacing={2} justifyContent="space-between">
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip label="Mock MVP" color="primary" variant="filled" size="small" />
              <Chip label="For Zoom" color="secondary" variant="outlined" size="small" />
            </Stack>
            <Typography variant="h4" fontWeight={800} mt={1}>
              Deal Desk & Quote Approvals
            </Typography>
            <Typography variant="body1" color="text.secondary" mt={0.5} maxWidth={900}>
              A focused workflow to help Zoom streamline approvals, align stakeholders across AE, Deal Desk, Finance, CRO and Legal,
              and move high‑value deals to “Sold” faster.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button component={Link} href="/create-quote" variant="contained" startIcon={<AddCircleOutlineIcon />}>
              Create Quote
            </Button>
            <Button component={Link} href="/import" variant="outlined" startIcon={<UploadFileIcon />}>Import</Button>
            <Button component={Link} href="/insights" variant="outlined" startIcon={<InsightsIcon />}>Insights</Button>
          </Stack>
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ p: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* KPI Tiles */}
        <Box>
          <Typography variant="overline" color="text.secondary">Zoom pipeline snapshot</Typography>
          {insightsLoading ? (
            <Box mt={1}>
              <CircularProgress size={20} />
            </Box>
          ) : insights ? (
            <Box display="grid" gap={2} sx={{ gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
              <Card variant="outlined">
                <CardHeader title="Total Quotes" />
                <CardContent>
                  <Typography variant="h5" fontWeight={700}>{insights.totals.totalQuotes}</Typography>
                </CardContent>
              </Card>
              <Card variant="outlined">
                <CardHeader title="Pending" />
                <CardContent>
                  <Typography variant="h5" fontWeight={700}>{insights.totals.totalPending}</Typography>
                  <Typography variant="body2" color="text.secondary">{formatPercent(insights.outcomePercentages.pendingPct)}</Typography>
                </CardContent>
              </Card>
              <Card variant="outlined">
                <CardHeader title="Approved" />
                <CardContent>
                  <Typography variant="h5" fontWeight={700}>{insights.totals.totalApproved}</Typography>
                  <Typography variant="body2" color="text.secondary">{formatPercent(insights.outcomePercentages.approvedPct)}</Typography>
                </CardContent>
              </Card>
              <Card variant="outlined">
                <CardHeader title="Sold" />
                <CardContent>
                  <Typography variant="h5" fontWeight={700}>{insights.totals.totalSold}</Typography>
                  <Typography variant="body2" color="text.secondary">Value {formatCurrency(insights.totals.totalValueSold)}</Typography>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Typography color="text.secondary">Unable to load insights.</Typography>
          )}
        </Box>

        <Divider flexItem sx={{ opacity: 0.2 }} />

        {/* Approval Queue (full width) */}
        <Card variant="outlined">
            <CardHeader
              title={
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="h6" fontWeight={700}>Your Approval Queue</Typography>
                  <Chip color="primary" variant="outlined" label={selectedRole} sx={{ textTransform: "uppercase" }} />
                </Stack>
              }
              action={
                <Stack direction="row" spacing={1} alignItems="center" sx={{ pr: 1 }}>
                  {(roles).map((r) => (
                    <Chip
                      key={r}
                      label={r}
                      clickable
                      color={selectedRole === r ? "primary" : "default"}
                      variant={selectedRole === r ? "filled" : "outlined"}
                      onClick={() => {
                        setSelectedRole(r);
                        const params = new URLSearchParams(searchParams ?? undefined);
                        params.set("role", r);
                        router.push(`/home?${params.toString()}`);
                      }}
                      sx={{ textTransform: "uppercase" }}
                    />
                  ))}
                  <Button size="small" onClick={() => refetchQueue()} disabled={queueLoading}>Refresh</Button>
                </Stack>
              }
            />
            <CardContent>
              {queueLoading ? (
                <Box display="flex" justifyContent="center" py={3}>
                  <CircularProgress size={22} />
                </Box>
              ) : !queue || queue.length === 0 ? (
                <Typography color="text.secondary">No quotes pending for {selectedRole}.</Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ background: "transparent" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Customer</TableCell>
                        <TableCell>Org</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Discount</TableCell>
                        <TableCell>Total</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {queue.map((q) => (
                        <TableRow
                          key={q.id}
                          hover
                          sx={{ cursor: "pointer" }}
                          onClick={() => router.push(`/quotes/${q.id}?from=home&role=${selectedRole}`)}
                        >
                          <TableCell>{q.customerName}</TableCell>
                          <TableCell>{q.org.name}</TableCell>
                          <TableCell><Chip label={q.status} size="small" /></TableCell>
                          <TableCell>{formatPercent(q.discountPercent as unknown as number)}</TableCell>
                          <TableCell>{formatCurrency(q.total as unknown as number)}</TableCell>
                          <TableCell>{format(new Date(q.createdAt), "MMM d, yyyy")}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="contained"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleApprove(q.id);
                              }}
                              disabled={approveMutation.isPending}
                            >
                              Approve
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
      </Box>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <Box p={3} display="flex" justifyContent="center">
          <CircularProgress size={24} />
        </Box>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}


