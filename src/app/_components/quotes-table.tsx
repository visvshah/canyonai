"use client";

import React, { useMemo, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";

import { format } from "date-fns";
import { Box, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, CircularProgress, Typography, Stack, Autocomplete, FormControl, InputLabel, Select, MenuItem, OutlinedInput, Button } from "@mui/material";
import { useRouter } from "next/navigation";

export type Quote = RouterOutputs["quote"]["all"][number];

function getNextApproval(quote: Quote): string {
  const steps = quote.approvalWorkflow?.steps ?? [];
  const pendingStep = steps.find((s) => s.status === "Pending");
  if (!pendingStep) return "—";
  return pendingStep.persona;
}

function formatCurrency(val: any): string {
  const num = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(num)) return String(val);
  return `$${num.toFixed(2)}`;
}

export function QuotesTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
  type PaymentKindOption = "NET" | "PREPAY" | "BOTH";
  const [selectedPaymentKinds, setSelectedPaymentKinds] = useState<PaymentKindOption[]>([]);

  const { data: catalog } = api.quote.catalog.useQuery();

  const packageOptions = catalog?.packages ?? [];
  const addOnOptions = catalog?.addOns ?? [];

  const queryInput = useMemo(() => {
    const base: any = {};
    if (search.trim()) base.search = search.trim();
    if (selectedPackageIds.length > 0) base.packageIds = selectedPackageIds;
    if (selectedAddOnIds.length > 0) base.addOnIds = selectedAddOnIds;
    if (selectedPaymentKinds.length > 0) base.paymentKinds = selectedPaymentKinds;
    return base;
  }, [search, selectedPackageIds, selectedAddOnIds, selectedPaymentKinds]);

  const { data: quotes, isLoading } = api.quote.all.useQuery(queryInput, {
    staleTime: 1000 * 60, // 1 minute
  });

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Filters */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
        <Box flex={1}>
          <TextField
            label="Search quotes"
            variant="outlined"
            size="small"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>
        <Box flex={1}>
          <Autocomplete
            multiple
            options={packageOptions}
            getOptionLabel={(o) => o.name}
            value={packageOptions.filter((p) => selectedPackageIds.includes(p.id))}
            onChange={(_, val) => setSelectedPackageIds(val.map((v) => v.id))}
            renderInput={(params) => <TextField {...params} label="Package" size="small" placeholder="All" />}
          />
        </Box>
        <Box flex={1}>
          <Autocomplete
            multiple
            options={addOnOptions}
            getOptionLabel={(o) => o.name}
            value={addOnOptions.filter((a) => selectedAddOnIds.includes(a.id))}
            onChange={(_, val) => setSelectedAddOnIds(val.map((v) => v.id))}
            renderInput={(params) => <TextField {...params} label="Add-ons" size="small" placeholder="All" />}
          />
        </Box>
        <FormControl sx={{ minWidth: 160 }} size="small">
          <InputLabel id="payment-kind-label">Payment</InputLabel>
          <Select
            labelId="payment-kind-label"
            multiple
            value={selectedPaymentKinds}
            onChange={(e) => setSelectedPaymentKinds(typeof e.target.value === "string" ? (e.target.value.split(",") as PaymentKindOption[]) : (e.target.value as PaymentKindOption[]))}
            input={<OutlinedInput label="Payment" />}
            renderValue={(selected) => (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {(selected as string[]).map((value) => (
                  <Chip key={value} label={value} size="small" />
                ))}
              </Box>
            )}
          >
            {(["NET", "PREPAY", "BOTH"] as PaymentKindOption[]).map((kind) => (
              <MenuItem key={kind} value={kind}>
                {kind}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          onClick={() => {
            setSearch("");
            setSelectedPackageIds([]);
            setSelectedAddOnIds([]);
            setSelectedPaymentKinds([]);
          }}
        >
          Clear
        </Button>
      </Stack>

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
                <TableCell>Product</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Seats</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Total</TableCell>
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
                  <TableCell>{q.package?.name}</TableCell>
                  <TableCell>
                    <Chip label={q.status} size="small" />
                  </TableCell>
                  <TableCell>{q.quantity}</TableCell>
                  <TableCell>{q.paymentKind}</TableCell>
                  <TableCell>{formatCurrency(q.total)}</TableCell>
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
