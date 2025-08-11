"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, Divider, IconButton, Paper, Tab, Tabs, TextField, Typography, Container, Stack } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SendIcon from "@mui/icons-material/Send";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { format } from "date-fns";

type ChatRole = "assistant" | "user";
type ChatMessage = { id: string; role: ChatRole; content: string };
type Mode = "find" | "create";

type FindResultItem = {
  quoteId: string;
  createdAt: string | Date;
  status: string;
  customerName: string;
  package: { id: string; name: string };
  quantity: number;
  discountPercent: number;
  addOns: { id: string; name: string }[];
  paymentKind: string;
  netDays: number | null;
  prepayPercent: number | null;
  subtotal: number;
  total: number;
  similarity: { score: number; reasons: string[] };
};

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <Box display="flex" justifyContent={isUser ? "flex-end" : "flex-start"} width="100%">
      <Paper
        elevation={0}
        sx={(t) => ({
          px: 1.75,
          py: 1.25,
          maxWidth: "78%",
          backgroundColor: isUser
            ? t.palette.primary.main
            : alpha(t.palette.primary.light, 0.08),
          color: isUser ? t.palette.primary.contrastText : t.palette.text.primary,
          borderRadius: 3,
          border: `1px solid ${isUser ? alpha(t.palette.primary.contrastText, 0.2) : alpha(t.palette.divider, 0.6)}`,
        })}
      >
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {message.content}
        </Typography>
      </Paper>
    </Box>
  );
}

export default function CreateQuotePage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("find");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasStoppedChat, setHasStoppedChat] = useState(false);
  const [findResults, setFindResults] = useState<FindResultItem[]>([]);
  const [similarCue, setSimilarCue] = useState<FindResultItem[] | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, hasStoppedChat]);

  const { data: catalog } = api.quote.catalog.useQuery(undefined, { staleTime: 60_000 });

  const hasCatalog = useMemo(() => {
    const pkgCount = (catalog?.packages?.length ?? 0);
    const addOnCount = (catalog?.addOns?.length ?? 0);
    return pkgCount + addOnCount > 0;
  }, [catalog]);

  useEffect(() => {
    if (hasCatalog && messages.length === 0) {
      const pkgList = (catalog?.packages ?? []).slice(0, 10).map((p) => `${p.name}`).join("\n- ");
      const addOnList = (catalog?.addOns ?? []).slice(0, 10).map((a) => `${a.name}`).join("\n- ");
      const content =
        mode === "find"
          ? [
              "Hey! I can help you find quotes. Specify a package or add-ons to get started.",
              pkgList ? `\nAvailable packages:\n- ${pkgList}` : "",
              addOnList ? `\nAvailable add-ons:\n- ${addOnList}` : "",
            ].filter(Boolean).join("\n")
          : [
              "Hey! I can help create a quote. Minimal: package (name or id) and customerName; add-ons optional.",
              "If seats/discount/payment are missing, I’ll infer from similar quotes and proceed.",
              "Helpful optional fields: seats, discountPercent, paymentKind, netDays, prepayPercent.",
              pkgList ? `\nAvailable packages:\n- ${pkgList}` : "",
              addOnList ? `\nAvailable add-ons:\n- ${addOnList}` : "",
            ].filter(Boolean).join("\n");
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content }]);
    }
  }, [hasCatalog, catalog, mode, messages.length]);

  useEffect(() => {
    if (hasCatalog) {
      const pkgList = (catalog?.packages ?? []).slice(0, 10).map((p) => `${p.name}`).join("\n- ");
      const addOnList = (catalog?.addOns ?? []).slice(0, 10).map((a) => `${a.name}`).join("\n- ");
      const content =
        mode === "find"
          ? [
              "Hey! I can help you find quotes. Specify a package or add-ons to get started.",
              pkgList ? `\nAvailable packages:\n- ${pkgList}` : "",
              addOnList ? `\nAvailable add-ons:\n- ${addOnList}` : "",
            ].filter(Boolean).join("\n")
          : [
              "I can create a quote. Minimal: package (name or id) and customerName; add-ons optional.",
              "If seats/discount/payment are missing, I’ll infer from similar quotes and proceed.",
              "Helpful optional fields: seats, discountPercent, paymentKind, netDays, prepayPercent.",
              pkgList ? `\nAvailable packages:\n- ${pkgList}` : "",
              addOnList ? `\nAvailable add-ons:\n- ${addOnList}` : "",
            ].filter(Boolean).join("\n");
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content }]);
    } else {
      setMessages([]);
    }
    setInput("");
    setIsProcessing(false);
    setHasStoppedChat(false);
    setFindResults([]);
    setSimilarCue(null);
  }, [mode, hasCatalog, catalog]);

  const pushAssistant = (content: string) => setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content }]);

  const callAi = async (allMessages: ChatMessage[]) => {
    const payload = {
      mode,
      messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
    };
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      return { type: "error", message: text || res.statusText } as const;
    }
    return (await res.json()) as
      | { type: "assistant_message"; message: string }
      | { type: "find_results"; data: { status: string; results: FindResultItem[] } }
      | { type: "quote_created"; quoteId: string; data: any }
      | { type: "error"; message: string };
  };

  const onSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing || hasStoppedChat) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (mode === "create") {
      pushAssistant("Searching similar quotes and inferring fields…");
    }
    setIsProcessing(true);
    try {
      const resp = await callAi([...messages, userMsg]);
      if (resp.type === "assistant_message") {
        pushAssistant(resp.message);
      } else if (resp.type === "find_results") {
        if (mode === "find") {
          setHasStoppedChat(true);
          setFindResults(resp.data.results ?? []);
        } else {
          // Create mode: show a lightweight cue but keep chatting
          setSimilarCue((resp.data.results ?? []).slice(0, 3));
        }
      } else if (resp.type === "quote_created") {
        if (mode === "create" && resp.data?.similarUsedTop3) {
          setSimilarCue(resp.data.similarUsedTop3 as FindResultItem[]);
          pushAssistant("Created from similar quotes.");
          setTimeout(() => router.replace(`/quotes/${resp.quoteId}`), 800);
        } else {
          router.replace(`/quotes/${resp.quoteId}`);
        }
      } else if (resp.type === "error") {
        pushAssistant(`Error: ${resp.message}`);
      }
    } catch (e: any) {
      pushAssistant("Sorry, something went wrong. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setInput("");
    setIsProcessing(false);
    setHasStoppedChat(false);
    setFindResults([]);
  };

  const onModeChange = (_: React.SyntheticEvent, newValue: string) => setMode(newValue as Mode);

  return (
    <main className="flex min-h-screen flex-col">
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Tabs value={mode} onChange={onModeChange} textColor="primary" indicatorColor="primary" variant="scrollable">
              <Tab label="Find quotes" value="find" />
              <Tab label="Create quote" value="create" />
            </Tabs>
          </Box>

          {mode === "find" && hasStoppedChat ? (
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6" fontWeight={600}>Similar quotes</Typography>
                <Button startIcon={<RestartAltIcon />} onClick={resetChat} variant="outlined" color="inherit">Start over</Button>
              </Box>
              {findResults.length === 0 ? (
                <Typography color="text.secondary">No similar quotes found.</Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                  {findResults.map((r) => (
                    <Paper
                      key={r.quoteId}
                      variant="outlined"
                      sx={{ p: 1.5, cursor: "pointer", transition: "background-color 120ms ease-in-out", "&:hover": { backgroundColor: (t) => alpha(t.palette.primary.light, 0.06) } }}
                      onClick={() => {
                        window.open(`/quotes/${r.quoteId}`, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{r.customerName}</Typography>
                          <Chip size="small" label={r.status} />
                        </Box>
                        <Typography variant="caption" color="text.secondary">{format(new Date(r.createdAt), "MMM d, yyyy")}</Typography>
                      </Box>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
                        <Chip label={`Package: ${r.package.name}`} />
                        <Chip label={`Seats: ${r.quantity}`} />
                        <Chip label={`Discount: ${r.discountPercent}%`} />
                        <Chip label={`Payment: ${r.paymentKind}`} />
                        <Chip label={`Total: $${r.total.toFixed(2)}`} />
                      </Box>
                      {r.addOns && r.addOns.length > 0 && (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 0.5 }}>
                          <Typography variant="caption" sx={{ mr: 1 }} color="text.secondary">Add-ons:</Typography>
                          {r.addOns.map((a) => (
                            <Chip key={a.id} label={a.name} variant="outlined" />
                          ))}
                        </Box>
                      )}
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        <Typography variant="caption" sx={{ mr: 1 }} color="text.secondary">Similarity:</Typography>
                        {r.similarity.reasons.map((reason, idx) => (
                          <Chip key={idx} label={reason} variant="outlined" />
                        ))}
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </Box>
          ) : (
            <>
              <Paper
                variant="outlined"
                sx={{ p: 2, height: { xs: 500, md: 620 }, display: "flex", flexDirection: "column", gap: 1, position: "relative", backdropFilter: "saturate(120%) blur(2px)" }}
              >
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, overflowY: "auto", pr: 0.5 }}>
                  {messages.map((m) => (
                    <ChatBubble key={m.id} message={m} />
                  ))}
                  {mode === "create" && similarCue && similarCue.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Paper variant="outlined" sx={(t) => ({ p: 1, backgroundColor: alpha(t.palette.primary.light, 0.06) })}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                          <Typography variant="caption" fontWeight={600}>Found similar quotes ({similarCue.length})</Typography>
                          <Button size="small" variant="text" onClick={() => setSimilarCue(null)}>Hide</Button>
                        </Box>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                          {similarCue.map((r) => (
                            <Paper
                              key={r.quoteId}
                              variant="outlined"
                              sx={{ p: 1, cursor: "pointer" }}
                              onClick={() => window.open(`/quotes/${r.quoteId}`, "_blank", "noopener,noreferrer")}
                            >
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                                <Chip label={r.package.name} />
                                <Chip label={`Seats ${r.quantity}`} />
                                <Chip label={`${r.paymentKind}`} />
                                <Chip label={`${format(new Date(r.createdAt), "MMM d, yyyy")}`} />
                              </Box>
                              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                                {r.similarity.reasons.slice(0, 3).map((reason, idx) => (
                                  <Chip key={idx} label={reason} variant="outlined" />
                                ))}
                              </Box>
                            </Paper>
                          ))}
                        </Box>
                      </Paper>
                    </Box>
                  )}
                  <div ref={chatEndRef} />
                </Box>
                {!hasStoppedChat && (
                  <Box display="flex" alignItems="center" gap={1} sx={(t) => ({ pt: 1, borderTop: `1px solid ${alpha(t.palette.divider, 0.6)}` })}>
                    <TextField
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onSubmit();
                        }
                      }}
                      size="small"
                      fullWidth
                      placeholder="Type your message..."
                      variant="filled"
                    />
                    <IconButton color="primary" onClick={onSubmit} disabled={isProcessing || !input.trim()} aria-label="Send" size="large">
                      {isProcessing ? <CircularProgress size={18} /> : <SendIcon />}
                    </IconButton>
                    <IconButton color="inherit" onClick={resetChat} aria-label="Restart" size="large">
                      <RestartAltIcon />
                    </IconButton>
                  </Box>
                )}
              </Paper>

              {mode === "find" && (
                <Box display="flex" justifyContent="flex-end" sx={{ mt: 1 }}>
                  <Button startIcon={<RestartAltIcon />} onClick={resetChat} variant="outlined" color="inherit">Restart</Button>
                </Box>
              )}
            </>
          )}

          <Divider sx={{ my: 1 }} />
        </Stack>
      </Container>
    </main>
  );
}

