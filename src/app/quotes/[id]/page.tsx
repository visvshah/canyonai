"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { format } from "date-fns";
import { Box, Button, Chip, CircularProgress, Divider, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import { Role, ApprovalStatus } from "@prisma/client";

// dnd-kit
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { alpha } from "@mui/material/styles";

const roles = Object.values(Role) as readonly Role[];

type Step = {
  id: string;
  role: Role;
  status?: ApprovalStatus;
};

type ApprovalWorkflowBuilderProps = {
  value?: Step[];
  onChange?: (steps: Step[]) => void;
  hasUnsaved?: boolean;
  onSaveChanges?: () => void | Promise<void>;
  saving?: boolean;
};

// no DragHandle: whole tile is draggable

function SortableStepItem({ step, onDelete }: { step: Step; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: step.status === "Approved" });

  const base =
    step.status === ApprovalStatus.Approved
      ? "success"
      : step.status === ApprovalStatus.Rejected
      ? "error"
      : "warning";

  const bg = (theme: any) =>
    `linear-gradient(135deg, ${alpha(theme.palette[base].main, 0.18)} 0%, ${alpha(theme.palette[base].main, 0.1)} 100%)`;
  const border = (theme: any) => alpha(theme.palette[base].main, 0.35);
  const textColor = (theme: any) => theme.palette.text.primary;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Box ref={setNodeRef} sx={style}>
      <Paper
        variant="outlined"
        sx={{
          position: "relative",
          px: 1.25,
          py: 1,
          minWidth: 120,
          borderRadius: 1.5,
          borderColor: border,
          backgroundImage: bg,
          color: textColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          boxShadow: isDragging ? 2 : 0,
          cursor: "grab",
          "&:hover .delete-btn": { opacity: 1 },
        }}
        {...attributes}
        {...listeners}
      >
        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, textTransform: "uppercase" }} noWrap>
            {step.role}
          </Typography>
          {step.status ? (
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              {step.status.toLowerCase()}
            </Typography>
          ) : null}
        </Box>
        {step.status !== ApprovalStatus.Approved && (
          <IconButton
            className="delete-btn"
            size="small"
            color="error"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(step.id)}
            sx={{ opacity: 0 }}
            aria-label="Delete step"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Paper>
    </Box>
  );
}

function DraggableRoleTile({ role }: { role: Step["role"] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${role}`,
    data: { from: "palette", role },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString((transform as any) ?? { x: 0, y: 0 }),
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <Box ref={setNodeRef} sx={style}>
      <Paper
        variant="outlined"
        {...attributes}
        {...listeners}
        sx={{
          px: 1.25,
          py: 1,
          minWidth: 110,
          borderRadius: 1.5,
          backgroundColor: (t) => alpha(t.palette.grey[200], 0.5),
          borderColor: (t) => alpha(t.palette.grey[400], 0.7),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {role}
        </Typography>
      </Paper>
    </Box>
  );
}

function WorkflowDroppableContainer({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "workflow-container" });
  return (
    <Box ref={setNodeRef} sx={{
      p: 1,
      border: '1px dashed',
      borderColor: (t) => (isOver ? t.palette.primary.main : alpha(t.palette.divider, 0.6)),
      borderRadius: 1,
      backgroundColor: (t) => (isOver ? alpha(t.palette.primary.main, 0.04) : 'transparent'),
    }}>
      {children}
    </Box>
  );
}

function ApprovalWorkflowBuilder({ value, onChange, hasUnsaved, onSaveChanges, saving }: ApprovalWorkflowBuilderProps) {
  const [steps, setSteps] = useState<Step[]>(value ?? []);

  useEffect(() => {
    setSteps(value ?? []);
  }, [value]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const updateSteps = (next: Step[]) => {
    setSteps(next);
    onChange?.(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = (active.data?.current ?? {}) as any;

    // Adding from palette
    if (activeData.from === "palette") {
      const role: Step["role"] = activeData.role;
      let insertIndex = steps.length; // default append
      if (over.id !== "workflow-container") {
        const overIndex = steps.findIndex((s) => s.id === over.id);
        if (overIndex >= 0) insertIndex = overIndex;
      }
      // Enforce rule: cannot insert before approved steps → clamp to after the last approved index
      const lastApprovedIdx = steps.reduce((last, s, idx) => (s.status === ApprovalStatus.Approved ? idx : last), -1);
      const minInsert = lastApprovedIdx + 1;
      if (insertIndex < minInsert) insertIndex = minInsert;
      insertAt(insertIndex, role);
      return;
    }

    // Reordering inside the workflow
    const oldIndex = steps.findIndex((s) => s.id === active.id);
    if (oldIndex === -1) return;
    let newIndex = oldIndex;
    if (over.id === "workflow-container") {
      newIndex = steps.length - 1;
    } else {
      const idx = steps.findIndex((s) => s.id === over.id);
      if (idx !== -1) newIndex = idx;
    }
    // Enforce rule: cannot move a step before approved steps → clamp to after the last approved index
    const lastApprovedIdx = steps.reduce((last, s, idx) => (s.status === ApprovalStatus.Approved ? idx : last), -1);
    const minIndex = Math.min(steps.length - 1, lastApprovedIdx + 1);
    if (newIndex < minIndex) newIndex = minIndex;
    if (oldIndex !== newIndex) updateSteps(arrayMove(steps, oldIndex, newIndex));
  };

  const insertAt = (index: number, role: Step["role"]) => {
    const newStep: Step = { id: crypto.randomUUID(), role, status: ApprovalStatus.Pending };
    const next = [...steps.slice(0, index), newStep, ...steps.slice(index)];
    updateSteps(next);
  };

  const handleDelete = (id: string) => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx === -1) return;
    // Enforce rule: cannot delete approved steps
    if (steps[idx]!.status === ApprovalStatus.Approved) return;
    updateSteps(steps.filter((s) => s.id !== id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <Box>
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Drag a role into the workflow to add a step
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {roles.map((r) => (
              <DraggableRoleTile key={r} role={r} />
            ))}
          </Box>
        </Box>

        <SortableContext items={steps.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          <WorkflowDroppableContainer>
            <Box component="ol" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {steps.map((step) => (
                <SortableStepItem key={step.id} step={step} onDelete={handleDelete} />
              ))}
            </Box>
          </WorkflowDroppableContainer>
        </SortableContext>

        <Box sx={{ mt: 1.5 }}>
          <Button variant="contained" disabled={!hasUnsaved || saving} onClick={() => onSaveChanges?.()}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </Box>
      </Box>
    </DndContext>
  );
}

export default function QuoteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const quoteId = params?.id;

  const utils = api.useUtils();
  const { data: quote, isLoading } = api.quote.byId.useQuery(
    { id: quoteId },
    { enabled: !!quoteId, staleTime: 0 },
  );

  // Local builder state derived from server data
  const [builderSteps, setBuilderSteps] = useState<Step[]>([]);

  useEffect(() => {
    if (!quote) return;
    const mapped: Step[] = (quote.approvalWorkflow?.steps ?? []).map((s) => ({
      id: s.id,
      role: s.persona as Role,
      status: s.status as ApprovalStatus,
    }));
    setBuilderSteps(mapped);
  }, [quote]);

  const setWorkflowMutation = api.quote.setWorkflow.useMutation();
  const approveMutation = api.quote.approveNextForRole.useMutation();

  // Top-level save handler used by the builder component
  const handleSaveWorkflow = async () => {
    if (!quoteId) return;
    const payload = builderSteps.map((s) => ({ persona: s.role, status: s.status }));
    await setWorkflowMutation.mutateAsync({ quoteId, steps: payload });
    await Promise.all([
      utils.quote.byId.invalidate({ id: quoteId }),
      utils.quote.all.invalidate(),
    ]);
  };

  const handleApproveAs = async (role: Role) => {
    if (!quoteId) return;
    await approveMutation.mutateAsync({ quoteId, role });
    await Promise.all([
      utils.quote.byId.invalidate({ id: quoteId }),
      utils.quote.all.invalidate(),
    ]);
  };

  const onBack = () => {
    const from = searchParams?.get("from");
    const role = searchParams?.get("role");
    if (from === "home") {
      router.push(role ? `/home?role=${encodeURIComponent(role)}` : "/home");
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/quotes");
    }
  };

  // Compute current server steps for unsaved-change comparison
  const serverStepsForCompare = useMemo(
    () =>
      (quote?.approvalWorkflow?.steps ?? []).map((s) => ({
        id: s.id,
        role: s.persona as Role,
        status: s.status as ApprovalStatus,
      })),
    [quote],
  );

  const hasUnsaved = useMemo(
    () => JSON.stringify(builderSteps) !== JSON.stringify(serverStepsForCompare),
    [builderSteps, serverStepsForCompare],
  );

  if (isLoading || !quote) {
    return (
      <Box className="flex min-h-screen flex-col gap-6 p-6" display="flex" alignItems="center" justifyContent="center">
        {isLoading ? <CircularProgress /> : <Typography>Quote not found.</Typography>}
      </Box>
    );
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <Box display="flex" alignItems="center" gap={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} variant="text">
          Back
        </Button>
        <Typography variant="h5" fontWeight={600} sx={{ ml: 1 }}>
          {quote.customerName}
        </Typography>
      </Box>

      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Quote Details
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
          <Table size="small" aria-label="quote details">
            <TableBody>
              <TableRow>
                <TableCell width={180}>Status</TableCell>
                <TableCell>
                  <Chip label={quote.status} size="small" />
                  {/* Quick-approve for next persona on detail page */}
                  {quote.approvalWorkflow?.steps?.some((s) => s.status === "Pending") && (
                    (() => {
                      const next = quote.approvalWorkflow!.steps.find((s) => s.status === "Pending")!;
                      return (
                        <Button
                          size="small"
                          sx={{ ml: 1 }}
                          variant="contained"
                          onClick={() => handleApproveAs(next.persona as Role)}
                          disabled={approveMutation.isPending}
                        >
                          Approve as {next.persona}
                        </Button>
                      );
                    })()
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Quote ID</TableCell>
                <TableCell>{quote.id}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Org</TableCell>
                <TableCell>{quote.org.name}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Payment Kind</TableCell>
                <TableCell>{quote.paymentKind}</TableCell>
              </TableRow>
              {quote.paymentKind === "NET" && (
                <TableRow>
                  <TableCell>Net Days</TableCell>
                  <TableCell>{quote.netDays}</TableCell>
                </TableRow>
              )}
              {quote.paymentKind === "PREPAY" && (
                <TableRow>
                  <TableCell>Prepay %</TableCell>
                  <TableCell>{quote.prepayPercent?.toString()}</TableCell>
                </TableRow>
              )}
              {quote.paymentKind === "BOTH" && (
                <>
                  <TableRow>
                    <TableCell>Net Days</TableCell>
                    <TableCell>{quote.netDays}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Prepay %</TableCell>
                    <TableCell>{quote.prepayPercent?.toString()}</TableCell>
                  </TableRow>
                </>
              )}
              <TableRow>
                <TableCell>Subtotal</TableCell>
                <TableCell>${Number(quote.subtotal as any).toFixed ? Number(quote.subtotal as any).toFixed(2) : (quote.subtotal as any).toString?.() ?? String(quote.subtotal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Discount %</TableCell>
                <TableCell>{Number(quote.discountPercent as any).toFixed ? Number(quote.discountPercent as any).toFixed(0) : (quote.discountPercent as any).toString?.() ?? String(quote.discountPercent)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell>${Number(quote.total as any).toFixed ? Number(quote.total as any).toFixed(2) : (quote.total as any).toString?.() ?? String(quote.total)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Package</TableCell>
                <TableCell>{(quote as any).package?.name}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Seats</TableCell>
                <TableCell>{(quote as any).seatCount ?? (quote as any).quantity ?? 1}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Created By</TableCell>
                <TableCell>{quote.createdBy?.name ?? quote.createdBy?.email ?? "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Add-ons</TableCell>
                <TableCell>
                  {(quote as any).addOns && (quote as any).addOns.length > 0 ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(quote as any).addOns.map((a: any) => (
                        <Chip key={a.id} size="small" label={a.name as string} />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">None</Typography>
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Created</TableCell>
                <TableCell>{format(new Date(quote.createdAt), "MMM d, yyyy")}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Updated</TableCell>
                <TableCell>{format(new Date(quote.updatedAt), "MMM d, yyyy")}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Workflow Editor
        </Typography>
        <ApprovalWorkflowBuilder
          value={builderSteps}
          onChange={(s) => setBuilderSteps(s)}
          hasUnsaved={hasUnsaved}
          saving={setWorkflowMutation.isPending}
          onSaveChanges={handleSaveWorkflow}
        />
      </Box>

      {quote.documentHtml ? (
        <Box>
          <Typography variant="subtitle1" gutterBottom>
            Contract Preview
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: quote.documentHtml }} />
          </Paper>
        </Box>
      ) : null}
    </main>
  );
}


