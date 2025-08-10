"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type RouterOutputs } from "~/trpc/react";
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
} from "@mui/material";
import { format } from "date-fns";

type PendingQuote = RouterOutputs["quote"]["pendingByRole"][number];

function getNextApprovalPersona(quote: PendingQuote): string {
  const steps = quote.approvalWorkflow?.steps ?? [];
  const pendingStep = steps.find((s) => s.status === "Pending");
  if (!pendingStep) return "—";
  if (pendingStep.approver) {
    return pendingStep.approver.name ?? pendingStep.approver.email ?? "User";
  }
  return pendingStep.persona;
}

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roles = useMemo(() => Object.values(Role) as readonly Role[], []);
  const [selectedRole, setSelectedRole] = useState<Role>(roles[0]!);

  // Initialize role from query param if present and valid
  useEffect(() => {
    const r = searchParams?.get("role");
    if (!r) return;
    if ((roles as readonly string[]).includes(r)) {
      setSelectedRole(r as Role);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const utils = api.useUtils();
  const { data: quotes, isLoading, refetch } = api.quote.pendingByRole.useQuery(
    { role: selectedRole },
    { staleTime: 0 },
  );

  const approveMutation = api.quote.approveNextForRole.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.quote.pendingByRole.invalidate({ role: selectedRole }),
        utils.quote.all.invalidate(),
      ]);
    },
  });

  const handleApprove = async (quoteId: string) => {
    await approveMutation.mutateAsync({ quoteId, role: selectedRole });
  };

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <Typography variant="h5" fontWeight={600} gutterBottom>
        Quotes waiting for your approval
      </Typography>

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2">Select role:</Typography>
        {roles.map((r) => (
          <Chip
            key={r}
            label={r}
            clickable
            color={selectedRole === r ? "primary" : "default"}
            onClick={() => {
              setSelectedRole(r);
              const params = new URLSearchParams(searchParams ?? undefined);
              params.set("role", r);
              router.push(`/home?${params.toString()}`);
            }}
            variant={selectedRole === r ? "filled" : "outlined"}
            sx={{ textTransform: "uppercase" }}
          />
        ))}
        <Button size="small" onClick={() => refetch()} disabled={isLoading}>
          Refresh
        </Button>
      </Stack>

      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress size={24} />
        </Box>
      ) : !quotes || quotes.length === 0 ? (
        <Typography>No quotes pending for {selectedRole}.</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Org</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Next Approval</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {quotes.map((q) => (
                <TableRow key={q.id} hover>
                  <TableCell>
                    <Button component={Link} href={`/quotes/${q.id}?from=home&role=${selectedRole}`} variant="text">
                      {q.customerName}
                    </Button>
                  </TableCell>
                  <TableCell>{q.org.name}</TableCell>
                  <TableCell>
                    <Chip label={q.status} size="small" />
                  </TableCell>
                  <TableCell>{getNextApprovalPersona(q)}</TableCell>
                  <TableCell>{format(new Date(q.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleApprove(q.id)}
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
    </main>
  );
}


