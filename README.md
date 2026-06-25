# Bookly Support Agent

A customer support agent for Bookly, a (fictional) online bookstore. It handles
order status, returns, refunds, and policy questions — and it *resolves* those
issues by calling real tools against a real database, rather than just answering
from a script.

Built with **Next.js + TypeScript**, the **OpenAI API** (tool calling), and
**Neon Postgres**. Deploys to Vercel as-is.

---

## Architecture in one screen

A customer message flows through six files:

```
app/page.tsx          UI — chat + a live trace of the tools the agent called
      │  POST /api/chat (full message history)
      ▼
app/api/chat/route.ts single endpoint
      ▼
lib/agent.ts          the orchestrator: system prompt + tool-calling loop + grounding check
      ├─► lib/tools.ts     the actions: lookup_order, initiate_return,
      │                    process_refund, search_policies, escalate_to_human
      ├─► lib/policies.ts  hands the model all of Bookly's policy docs (a TS file)
      └─► lib/db.ts        Neon Postgres (orders, returns)
```

(Shared types live in `lib/types.ts`.)

The agent is a **single orchestrator with a tool belt** — not a multi-agent
router and not a hardcoded intent tree. One LLM call decides what to do; if it
needs data or an action it calls a tool, we run it, feed the result back, and
loop until it has a grounded answer. The loop is hand-rolled (no agent
framework) so every step is visible and debuggable.

Three design commitments shape everything:

1. **Resolve, don't deflect.** Tools
