"use client";

import React, { useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";

import { format } from "date-fns";
import { Box, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, CircularProgress, Typography } from "@mui/material";
import { useRouter } from "next/navigation";

// Helper types
export type Quote = RouterOutputs["quote"]["all"][number];

function getNextApproval(quote: Quote): string {
  const steps = quote.approvalWorkflow?.steps ?? [];
  const pendingStep = steps.find((s) => s.status === "Pending");
  if (!pendingStep) return "—";
  if (pendingStep.approver) {
    return pendingStep.approver.name ?? pendingStep.approver.email ?? "User";
  }
  // Fallback to persona role
  return pendingStep.persona;
}

export function QuotesTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const {
    data: quotes,
    isLoading,
  } = api.quote.all.useQuery(
    search.trim() ? { search } : {},
    {
      staleTime: 1000 * 60, // 1 minute
    },
  );

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Search */}
      <TextField
        label="Search quotes"
        variant="outlined"
        size="small"
        fullWidth
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress size={24} />
        </Box>
      ) : !quotes || quotes.length === 0 ? (
        <Typography>No quotes found.</Typography>
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
              </TableRow>
            </TableHead>
            <TableBody>
              {quotes.map((q) => (
                <TableRow
                  key={q.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => router.push(`/quotes/${q.id}`)}
                >
                  <TableCell>{q.customerName}</TableCell>
                  <TableCell>{q.org.name}</TableCell>
                  <TableCell>
                    <Chip label={q.status} size="small" />
                  </TableCell>
                  <TableCell>{getNextApproval(q)}</TableCell>
                  <TableCell>
                    {format(new Date(q.createdAt), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

    </div>
  );
}
