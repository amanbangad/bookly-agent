"use client";

import { useState, useRef, useEffect, RefObject } from "react";
import type { ChatMessage, ToolTrace } from "@/lib/types";

const SUGGESTIONS = [
  "Where's my order?",
  "I want to return a book",
  "Do you ship to Canada?",
  "There's a problem with my order",
];

// ---------------------------------------------------------------------------
// Page: owns the conversation state and the send logic. All markup lives in the
// small presentational components below, so this stays a readable orchestrator.
// ---------------------------------------------------------------------------
export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm Bookly's support agent. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the full history (minus traces) so the agent has context.
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.reply ?? data.error ?? "Something went wrong.",
          trace: data.trace,
        },
      ]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "I couldn't reach the server — try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <Header />
      <MessageList messages={messages} loading={loading} scrollRef={scrollRef} />
      <Composer input={input} setInput={setInput} onSend={send} loading={loading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational components — pure markup, no logic of their own.
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="header">
      <div className="wordmark">
        Bookly<span className="dot">.</span> Support
      </div>
      <div className="subhead">Order status · Returns & refunds · Policies</div>
    </header>
  );
}

function MessageList({
  messages,
  loading,
  scrollRef,
}: {
  messages: ChatMessage[];
  loading: boolean;
  scrollRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div className="messages" ref={scrollRef}>
      {messages.map((m, i) => (
        <MessageRow key={i} msg={m} />
      ))}
      {loading && (
        <div className="row assistant">
          <div className="bubble dots">
            <span>•</span>
            <span>•</span>
            <span>•</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageRow({ msg }: { msg: ChatMessage }) {
  return (
    <div>
      <div className={`row ${msg.role}`}>
        <div className="bubble">{msg.content}</div>
      </div>
      {msg.trace && msg.trace.length > 0 && <Trace trace={msg.trace} />}
    </div>
  );
}

function Composer({
  input,
  setInput,
  onSend,
  loading,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: (text: string) => void;
  loading: boolean;
}) {
  return (
    <div className="composer">
      <div className="suggests">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="suggest" onClick={() => onSend(s)} disabled={loading}>
            {s}
          </button>
        ))}
      </div>
      <div className="input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend(input)}
          placeholder="Type a message…"
          disabled={loading}
        />
        <button onClick={() => onSend(input)} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

// The tool trace: each tool the agent called this turn, expandable to show the
// raw result it grounded its answer on.
function Trace({ trace }: { trace: ToolTrace[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="trace">
      {trace.map((t, i) => (
        <div key={i} style={{ display: "contents" }}>
          <span className="chip" onClick={() => setOpen(open === i ? null : i)}>
            {labelFor(t.name)}
          </span>
          {open === i && (
            <div className="trace-detail">
              {JSON.stringify(t.args)} → {t.result}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function labelFor(name: string): string {
  const icons: Record<string, string> = {
    lookup_order: "🔍 lookup_order",
    get_orders_by_email: "📧 get_orders_by_email",
    initiate_return: "↩️ initiate_return",
    process_refund: "💵 process_refund",
    search_policies: "📚 search_policies",
    escalate_to_human: "🙋 escalate_to_human",
    grounding_check: "⚠️ grounding_check",
  };
  return icons[name] ?? name;
}
