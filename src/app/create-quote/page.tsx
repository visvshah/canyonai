"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, Divider, IconButton, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useRouter } from "next/navigation";
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
        sx={{
          px: 1.5,
          py: 1,
          maxWidth: "80%",
          backgroundColor: (t) => (isUser ? t.palette.primary.main : t.palette.grey[100]),
          color: (t) => (isUser ? t.palette.primary.contrastText : t.palette.text.primary),
          borderRadius: 2,
        }}
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

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, hasStoppedChat]);

  useEffect(() => {
    // reset on mode change
    setMessages([]);
    setInput("");
    setIsProcessing(false);
    setHasStoppedChat(false);
    setFindResults([]);
    // Optional greeting
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: mode === "find" ? "Tell me what you’re looking for and I’ll find similar quotes." : "Tell me the quote details and I’ll create it when ready." }]);
  }, [mode]);

  const pushAssistant = (content: string) => setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content }]);
  const pushUser = (content: string) => setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content }]);

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
    setIsProcessing(true);
    try {
      const resp = await callAi([...messages, userMsg]);
      if (resp.type === "assistant_message") {
        pushAssistant(resp.message);
      } else if (resp.type === "find_results") {
        setHasStoppedChat(true);
        setFindResults(resp.data.results ?? []);
      } else if (resp.type === "quote_created") {
        router.replace(`/quotes/${resp.quoteId}`);
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
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: mode === "find" ? "Tell me what you’re looking for and I’ll find similar quotes." : "Tell me the quote details and I’ll create it when ready." }]);
  };

  const onModeChange = (_: React.SyntheticEvent, newValue: string) => setMode(newValue as Mode);

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <Box>
        <Tabs value={mode} onChange={onModeChange} textColor="primary" indicatorColor="primary">
          <Tab label="Find quotes" value="find" />
          <Tab label="Create quote" value="create" />
        </Tabs>
      </Box>

      {mode === "find" && hasStoppedChat ? (
        <Box>
          <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="h6" fontWeight={600}>Similar quotes</Typography>
            <Button startIcon={<RestartAltIcon />} onClick={resetChat} variant="text">Start over</Button>
          </Box>
          {findResults.length === 0 ? (
            <Typography>No similar quotes found.</Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {findResults.map((r) => (
                <Paper key={r.quoteId} variant="outlined" sx={{ p: 1.5 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{r.customerName}</Typography>
                      <Chip size="small" label={r.status} />
                    </Box>
                    <Button size="small" onClick={() => router.push(`/quotes/${r.quoteId}`)}>View</Button>
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
                    <Chip size="small" label={`Package: ${r.package.name}`} />
                    <Chip size="small" label={`Seats: ${r.quantity}`} />
                    <Chip size="small" label={`Discount: ${r.discountPercent}%`} />
                    <Chip size="small" label={`Payment: ${r.paymentKind}`} />
                    <Chip size="small" label={`Total: $${(r.total as any).toFixed ? (r.total as any).toFixed(2) : r.total}`} />
                    <Chip size="small" label={format(new Date(r.createdAt), "MMM d, yyyy")} />
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    <Typography variant="caption" sx={{ mr: 1 }} color="text.secondary">Similarity:</Typography>
                    {r.similarity.reasons.map((reason, idx) => (
                      <Chip key={idx} size="small" label={reason} variant="outlined" />
                    ))}
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2, minHeight: 360, display: "flex", flexDirection: "column", gap: 1 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, overflowY: "auto", pr: 0.5 }}>
              {messages.map((m) => (
                <ChatBubble key={m.id} message={m} />
              ))}
              <div ref={chatEndRef} />
            </Box>
            {!hasStoppedChat && (
              <Box display="flex" alignItems="center" gap={1}>
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
                />
                <IconButton color="primary" onClick={onSubmit} disabled={isProcessing} aria-label="Send">
                  {isProcessing ? <CircularProgress size={18} /> : <SendIcon />}
                </IconButton>
              </Box>
            )}
          </Paper>

          {mode === "find" && (
            <Box display="flex" justifyContent="flex-end" sx={{ mt: 1 }}>
              <Button startIcon={<RestartAltIcon />} onClick={resetChat} variant="text">Restart</Button>
            </Box>
          )}
        </>
      )}

      <Divider sx={{ my: 1 }} />
    </main>
  );
}

