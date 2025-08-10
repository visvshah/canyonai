"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { format, formatDistanceToNow } from "date-fns";
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from "@mui/material";
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
  showSaveButton?: boolean;
};

// no DragHandle: whole tile is draggable

function SortableStepItem({ step, onDelete, stepIndex }: { step: Step; onDelete: (id: string) => void; stepIndex?: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: step.status === "Approved" });

  const base =
    step.status === ApprovalStatus.Approved
      ? "success"
      : step.status === ApprovalStatus.Rejected
      ? "error"
      : step.status === ApprovalStatus.Pending
      ? "warning"
      : "info";

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
          px: 1.5,
          py: 1.25,
          minWidth: 140,
          borderRadius: 1,
          borderColor: border,
          backgroundImage: bg,
          color: textColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          boxShadow: isDragging ? 2 : 0,
          cursor: "grab",
          clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)",
          "&:hover .delete-btn": { opacity: 1 },
        }}
        {...attributes}
        {...listeners}
      >
        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {typeof stepIndex === "number" && (
            <Typography variant="caption" sx={{ opacity: 0.7, mb: 0.25 }}>
              Step {stepIndex}
            </Typography>
          )}
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
          px: 1.5,
          py: 1.1,
          minWidth: 130,
          borderRadius: 1,
          backgroundColor: (t) => alpha(t.palette.grey[200], 0.65),
          borderColor: (t) => alpha(t.palette.grey[400], 0.7),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
          clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)",
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

// Read-only renderer for workflow steps
function ReadOnlyStepItem({ step, stepIndex }: { step: Step; stepIndex: number }) {
  const base =
    step.status === ApprovalStatus.Approved
      ? "success"
      : step.status === ApprovalStatus.Rejected
      ? "error"
      : step.status === ApprovalStatus.Pending
      ? "warning"
      : "info";

  const bg = (theme: any) =>
    `linear-gradient(135deg, ${alpha(theme.palette[base].main, 0.18)} 0%, ${alpha(theme.palette[base].main, 0.1)} 100%)`;
  const border = (theme: any) => alpha(theme.palette[base].main, 0.35);
  const textColor = (theme: any) => theme.palette.text.primary;

  return (
    <Paper
      variant="outlined"
      sx={{
        px: 1.5,
        py: 1.25,
        minWidth: 140,
        borderRadius: 1,
        borderColor: border,
        backgroundImage: bg,
        color: textColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Typography variant="caption" sx={{ opacity: 0.7, mb: 0.25 }}>
          Step {stepIndex}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, textTransform: "uppercase" }} noWrap>
          {step.role}
        </Typography>
        {step.status ? (
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            {step.status.toLowerCase()}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

function ApprovalWorkflowBuilder({ value, onChange, hasUnsaved, onSaveChanges, saving, showSaveButton = true }: ApprovalWorkflowBuilderProps) {
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
    if (oldIndex !== newIndex) {
      const next = arrayMove(steps, oldIndex, newIndex);
      updateSteps(applyGating(next));
    }
  };

  const insertAt = (index: number, role: Step["role"]) => {
    const newStep: Step = { id: crypto.randomUUID(), role, status: ApprovalStatus.Waiting };
    const next = [...steps.slice(0, index), newStep, ...steps.slice(index)];
    updateSteps(applyGating(next));
  };

  const handleDelete = (id: string) => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx === -1) return;
    // Enforce rule: cannot delete approved steps
    if (steps[idx]!.status === ApprovalStatus.Approved) return;
    const next = steps.filter((s) => s.id !== id);
    updateSteps(applyGating(next));
  };

  // Gating: promote only the first non-approved step to Pending; others Waiting
  const applyGating = (list: Step[]): Step[] => {
    const out = list.map((s) => ({ ...s }));
    const hasRejected = out.some((s) => s.status === ApprovalStatus.Rejected);
    if (hasRejected) return out;
    const firstNonApprovedIndex = out.findIndex((s) => s.status !== ApprovalStatus.Approved);
    if (firstNonApprovedIndex === -1) return out;
    for (let i = 0; i < out.length; i++) {
      const st = out[i]!;
      if (st.status === ApprovalStatus.Approved) continue;
      st.status = i === firstNonApprovedIndex ? ApprovalStatus.Pending : ApprovalStatus.Waiting;
    }
    return out;
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
              {steps.map((step, i) => (
                <SortableStepItem key={step.id} step={step} onDelete={handleDelete} stepIndex={i + 1} />
              ))}
            </Box>
          </WorkflowDroppableContainer>
        </SortableContext>

        {showSaveButton ? (
          <Box sx={{ mt: 1.5 }}>
            <Button variant="contained" disabled={!hasUnsaved || saving} onClick={() => onSaveChanges?.()}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </Box>
        ) : null}
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

  // Read-only display steps and draft steps for modal editing
  const [displaySteps, setDisplaySteps] = useState<Step[]>([]);
  const [draftSteps, setDraftSteps] = useState<Step[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (!quote) return;
    const mapped: Step[] = (quote.approvalWorkflow?.steps ?? []).map((s) => ({
      id: s.id,
      role: s.persona as Role,
      status: s.status as ApprovalStatus,
    }));
    setDisplaySteps(mapped);
    if (!editorOpen) setDraftSteps(mapped);
  }, [quote, editorOpen]);

  const setWorkflowMutation = api.quote.setWorkflow.useMutation();
  const approveMutation = api.quote.approveNextForRole.useMutation();

  // Top-level save handler used by the builder component
  const handleSaveWorkflow = async () => {
    if (!quoteId) return;
    const payload = draftSteps.map((s) => ({ persona: s.role, status: s.status }));
    await setWorkflowMutation.mutateAsync({ quoteId, steps: payload });
    await Promise.all([
      utils.quote.byId.invalidate({ id: quoteId }),
      utils.quote.all.invalidate(),
    ]);
    setDisplaySteps(draftSteps);
    setEditorOpen(false);
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

  // Unsaved comparison: modal draft vs currently displayed
  const hasDraftUnsaved = useMemo(
    () => JSON.stringify(draftSteps) !== JSON.stringify(displaySteps),
    [draftSteps, displaySteps],
  );

  if (isLoading || !quote) {
    return (
      <Box className="flex min-h-screen flex-col gap-6 p-6" display="flex" alignItems="center" justifyContent="center">
        {isLoading ? <CircularProgress /> : <Typography>Quote not found.</Typography>}
      </Box>
    );
  }

  // Derived pricing numbers for clear equation
  const seats = (quote as any).seatCount ?? (quote as any).quantity ?? 1;
  const packageUnit = Number(((quote as any).package?.unitPrice as any) ?? 0);
  const addOnSum = ((quote as any).addOns ?? []).reduce(
    (acc: number, a: any) => acc + Number((a.unitPrice as any) ?? 0),
    0,
  );
  const packageExtended = packageUnit * seats;
  const subtotalNum = Number(quote.subtotal as any ?? 0) || packageExtended + addOnSum; // prefer server subtotal
  const discountPct = Number(quote.discountPercent as any ?? 0);
  const discountValue = (subtotalNum * discountPct) / 100;
  const totalNum = Number(quote.total as any ?? subtotalNum - discountValue);

  // Next pending step and duration
  const nextPending = quote.approvalWorkflow?.steps?.find((s) => s.status === "Pending");
  const pendingSince = nextPending?.updatedAt ?? nextPending?.createdAt ?? quote.createdAt;

  const fmt = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

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

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 2 }}>
        <Box>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" gutterBottom>
              Details
            </Typography>
            <Table size="small" aria-label="quote details">
              <TableBody>
                <TableRow>
                  <TableCell width={180}>Status</TableCell>
                  <TableCell>
                    <Chip label={quote.status} size="small" />
                    {nextPending ? (
                      <Button
                        size="small"
                        sx={{ ml: 1 }}
                        variant="contained"
                        onClick={() => handleApproveAs(nextPending.persona as Role)}
                        disabled={approveMutation.isPending}
                      >
                        Approve as {nextPending.persona}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Org</TableCell>
                  <TableCell>{quote.org.name}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Package</TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {(quote as any).package?.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {(quote as any).package?.description}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Add-ons</TableCell>
                  <TableCell>
                    {(quote as any).addOns && (quote as any).addOns.length > 0 ? (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {(quote as any).addOns.map((a: any) => (
                          <Chip key={a.id} size="small" label={a.name as string} />
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        None
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
                {nextPending ? (
                  <TableRow>
                    <TableCell>Next Approval</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Chip label={(nextPending.persona as string) ?? "—"} size="small" />
                        <Typography variant="body2" color="text.secondary">
                          Pending {formatDistanceToNow(new Date(pendingSince as any), { addSuffix: true })}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableCell>Created By</TableCell>
                  <TableCell>{quote.createdBy?.name ?? quote.createdBy?.email ?? "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Quote ID</TableCell>
                  <TableCell>{quote.id}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Created</TableCell>
                  <TableCell>{format(new Date(quote.createdAt), "MMM d, yyyy")}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Last Updated</TableCell>
                  <TableCell>{format(new Date(quote.updatedAt), "MMM d, yyyy")}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        </Box>

        <Box>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" gutterBottom>
              Financials
            </Typography>
            <Box sx={{ display: "grid", rowGap: 0.75 }}>
              <Typography variant="body2">
                Package {((quote as any).package?.name as string) ?? ""} @ <b>{fmt(packageUnit)}</b> × <b>{seats}</b> = <b>{fmt(packageExtended)}</b>
              </Typography>
              <Typography variant="body2">
                Add-ons total = <b>{fmt(addOnSum)}</b>
              </Typography>
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="body2">
                Subtotal = <b>{fmt(subtotalNum)}</b>
              </Typography>
              <Typography variant="body2">
                Discount {discountPct}% = <b>-{fmt(discountValue)}</b>
              </Typography>
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="body1" fontWeight={700}>
                Total = {fmt(totalNum)}
              </Typography>
            </Box>

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" gutterBottom>
              Payment Terms
            </Typography>
            <Table size="small" aria-label="payment terms">
              <TableBody>
                <TableRow>
                  <TableCell width={140}>Payment Kind</TableCell>
                  <TableCell>{quote.paymentKind}</TableCell>
                </TableRow>
                {quote.paymentKind === "NET" || quote.paymentKind === "BOTH" ? (
                  <TableRow>
                    <TableCell>Net Days</TableCell>
                    <TableCell>{quote.netDays ?? "—"}</TableCell>
                  </TableRow>
                ) : null}
                {quote.paymentKind === "PREPAY" || quote.paymentKind === "BOTH" ? (
                  <TableRow>
                    <TableCell>Prepay %</TableCell>
                    <TableCell>{(quote.prepayPercent as any)?.toString?.() ?? String(quote.prepayPercent ?? "—")}</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="subtitle1" gutterBottom>Approval Workflow</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {displaySteps.length > 0 ? (
            displaySteps.map((s, i) => (
              <ReadOnlyStepItem key={s.id} step={s} stepIndex={i + 1} />
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">No steps</Typography>
          )}
        </Box>
        <Box sx={{ mt: 1.5 }}>
          <Button variant="outlined" onClick={() => setEditorOpen(true)}>Edit Workflow</Button>
        </Box>
      </Box>

      <Dialog
        fullWidth
        maxWidth="md"
        open={editorOpen}
        onClose={() => {
          // reset drafts when closing without save
          setDraftSteps(displaySteps);
          setEditorOpen(false);
        }}
      >
        <DialogTitle>Edit Approval Workflow</DialogTitle>
        <DialogContent dividers>
          <ApprovalWorkflowBuilder
            value={draftSteps}
            onChange={(s) => setDraftSteps(s)}
            hasUnsaved={hasDraftUnsaved}
            saving={setWorkflowMutation.isPending}
            onSaveChanges={handleSaveWorkflow}
            showSaveButton={false}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDraftSteps(displaySteps);
              setEditorOpen(false);
            }}
            disabled={setWorkflowMutation.isPending}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveWorkflow} disabled={!hasDraftUnsaved || setWorkflowMutation.isPending}>
            {setWorkflowMutation.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>

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


