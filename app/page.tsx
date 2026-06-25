"use client";

import { useState, useRef, useEffect } from "react";

type ToolTrace = { name: string; args: any; result: string };
type Msg = { role: "user" | "assistant"; content: string; trace?: ToolTrace[] };

const SUGGESTIONS = [
  "Where's my order?",
  "I want to return a book",
  "Do you ship to Canada?",
  "There's a problem with my order",
];

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Hi! I'm Bookly's support agent. How can I help you today?",
    },
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

    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
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
      <header className="header">
        <div className="wordmark">
          Bookly<span className="dot">.</span> Support
        </div>
        <div className="subhead">Order status · Returns & refunds · Policies</div>
      </header>

      <div className="messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`row ${m.role}`}>
              <div className="bubble">{m.content}</div>
            </div>
            {m.trace && m.trace.length > 0 && <Trace trace={m.trace} />}
          </div>
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

      <div className="composer">
        <div className="suggests">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggest" onClick={() => send(s)} disabled={loading}>
              {s}
            </button>
          ))}
        </div>
        <div className="input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Type a message…"
            disabled={loading}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
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
  };
  return icons[name] ?? name;
}
