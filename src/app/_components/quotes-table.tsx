"use client";

import { useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";

import { format } from "date-fns";
import {
  Box,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  Chip,
  CircularProgress,
  Typography,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import Collapse from "@mui/material/Collapse";

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
  const utils = api.useContext();
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  
  // TRPC mutation for deleting approval steps with optimistic update
  const deleteStep = api.quote.deleteApprovalStep.useMutation({
    // Optimistic update
    onMutate: async ({ stepId }) => {
      // For animation
      setRemovedIds((prev) => new Set(prev).add(stepId));

      await utils.quote.all.cancel();
      const prevData = utils.quote.all.getData();

      // Optimistically update cache
      utils.quote.all.setData(undefined, (old) =>
        old?.map((q) => {
          if (!selected || q.id !== selected.id) return q;
          if (!q.approvalWorkflow) return q;
          const newSteps = q.approvalWorkflow.steps.filter((s) => s.id !== stepId).map((s, idx) => ({
            ...s,
            stepOrder: idx + 1,
          }));
          return {
            ...q,
            approvalWorkflow: newSteps.length
              ? { ...q.approvalWorkflow, steps: newSteps }
              : null,
            status: newSteps.length ? q.status : "Approved",
          } as typeof q;
        }),
      );

      // Also update selected state local
      setSelected((prev) => {
        if (!prev?.approvalWorkflow) return prev;
        const newSteps = prev.approvalWorkflow.steps.filter((s) => s.id !== stepId).map((s, idx) => ({
          ...s,
          stepOrder: idx + 1,
        }));
        return {
          ...prev,
          approvalWorkflow: newSteps.length ? { ...prev.approvalWorkflow, steps: newSteps } : null,
          status: newSteps.length ? prev.status : "Approved",
        } as Quote;
      });

      return { prevData };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback
      utils.quote.all.setData(undefined, ctx?.prevData);
      setRemovedIds(new Set());
    },
    onSuccess: () => {
      /* no-op */
    },
    onSettled: () => {
      void utils.quote.all.invalidate();
    },
  });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Quote | null>(null);

  const {
    data: quotes,
    isLoading,
    refetch,
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
                  onClick={() => setSelected(q)}
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

      {/* Modal */}
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        maxWidth="md"
        fullWidth
      >
        {selected && (
          <>
            <DialogTitle>{selected.customerName}</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" gutterBottom>
                <strong>Status:</strong> {selected.status}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Org:</strong> {selected.org.name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Payment Kind:</strong> {selected.paymentKind}
              </Typography>
              {selected.paymentKind === "NET" && (
                <Typography variant="body2" gutterBottom>
                  <strong>Net Days:</strong> {selected.netDays}
                </Typography>
              )}
              {selected.paymentKind === "PREPAY" && (
                <Typography variant="body2" gutterBottom>
                  <strong>Prepay %:</strong> {selected.prepayPercent?.toString()}
                </Typography>
              )}
              {selected.paymentKind === "BOTH" && (
                <>
                  <Typography variant="body2" gutterBottom>
                    <strong>Net Days:</strong> {selected.netDays}
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    <strong>Prepay %:</strong> {selected.prepayPercent?.toString()}
                  </Typography>
                </>
              )}
              <Typography variant="body2" gutterBottom>
                <strong>Subtotal:</strong> {selected.subtotal.toString()}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Discount %:</strong> {selected.discountPercent.toString()}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Total:</strong> {selected.total.toString()}
              </Typography>
              {/* Package */}
              <Typography variant="body2" gutterBottom>
                <strong>Package:</strong> {selected.package.name}
              </Typography>

              {/* Approval Workflow */}
              <Box mt={3}>
                <Typography variant="subtitle1" gutterBottom>
                  Approval Workflow
                </Typography>
                {selected.approvalWorkflow ? (
                  <Box component="ol" sx={{ pl: 2 }}>
                    {selected.approvalWorkflow.steps.map((step) => (
                      <Collapse in={!removedIds.has(step.id)} key={step.id}>
                        <Box
                          component="li"
                          display="flex"
                          alignItems="center"
                          gap={1}
                        >
                          <Typography variant="body2" sx={{ width: 80, fontWeight: 500 }}>
                            Step {step.stepOrder}
                          </Typography>
                          <Typography variant="body2" flex={1}>
                            {step.approver
                              ? step.approver.name ?? step.approver.email
                              : step.persona}
                          </Typography>
                          <Chip label={step.status} size="small" />
                          <IconButton
                            size="small"
                            color="error"
                            
                            onClick={() =>
                              deleteStep.mutate({ stepId: step.id })
                            }
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Collapse>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2">No approval workflow.</Typography>
                )}
              </Box>
            </DialogContent>
            <Box display="flex" justifyContent="flex-end" p={2}>
              <Button onClick={() => setSelected(null)} variant="contained">
                Close
              </Button>
            </Box>
          </>
        )}
      </Dialog>
    </div>
  );
}
