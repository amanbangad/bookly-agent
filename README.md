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
lib/agent.ts          the orchestrator: system prompt + tool-calling loop
      ├─► lib/tools.ts     the actions: lookup_order, initiate_return,
      │                    process_refund, search_policies, escalate_to_human
      ├─► lib/policies.ts  embedding retrieval over Bookly's policy docs
      └─► lib/db.ts        Neon Postgres (orders, returns, policies)
```

The agent is a **single orchestrator with a tool belt** — not a multi-agent
router and not a hardcoded intent tree. One LLM call decides what to do; if it
needs data or an action it calls a tool, we run it, feed the result back, and
loop until it has a grounded answer. The loop is hand-rolled (no agent
framework) so every step is visible and debuggable.

Three design commitments shape everything:

1. **Resolve, don't deflect.** Tools change real state (`initiate_return` writes
   a row and returns an RMA), they don't just look things up.
2. **Grounded or silent.** Order facts come from tool results, policy answers
   from retrieval — never the model's memory. The system prompt forbids
   unsourced claims.
3. **Know the edge.** The agent asks when info is missing or intent is unclear,
   and escalates when stakes exceed its authority. The refund limit is enforced
   in `tools.ts`, in code — not just requested in the prompt.

---

## Run it locally

**Prerequisites:** Node 18+, an OpenAI API key, a Neon Postgres database
(free tier is fine — copy its connection string).

```bash
# 1. install
npm install

# 2. configure — create .env.local with your two secrets
cp .env.example .env.local
#   then edit .env.local:
#   OPENAI_API_KEY=sk-...
#   DATABASE_URL=postgresql://...   (your Neon connection string)

# 3. create tables + seed orders and embed the policy docs (run once)
npm run seed

# 4. start
npm run dev
# open http://localhost:3000
```

> **Security note:** secrets live only in `.env.local` (gitignored) and in
> Vercel's environment variables. Never commit a real key or connection string.

## Deploy to Vercel

Push to GitHub, import the repo in Vercel, and set `OPENAI_API_KEY` and
`DATABASE_URL` in the project's Environment Variables. Run `npm run seed` once
locally (or from any machine) against the same database. That's it.

---

## Demo script (hits every required behavior)

Seeded data to play with:

| Order   | Email             | Status     | Total   |
| ------- | ----------------- | ---------- | ------- |
| BK-1001 | ada@example.com   | shipped    | $42.00  |
| BK-1003 | grace@example.com | processing | $31.50  |
| BK-1004 | linus@example.com | delivered  | $150.00 |

1. **Multi-turn + identity check** — "Where's my order?" → the agent asks for
   the order number *and* email before it looks anything up → give `BK-1001` /
   `ada@example.com` → it calls `lookup_order` and reports the real status.

2. **Taking a real action (tool use)** — "I need to return BK-1001, I changed my
   mind" → it confirms, calls `initiate_return`, and a row is written to the
   `returns` table with a real RMA number.

3. **Clarifying question** — "There's a problem with my order" → instead of
   guessing, it asks *what kind* of problem before doing anything.

4. **Guardrail / escalation** — ask for a $150 refund on BK-1004 → `process_refund`
   rejects it (over the $100 limit) and the agent escalates to a human instead of
   promising money it can't give.

5. **Grounded policy Q&A** — "Do you ship to Canada?" → it calls `search_policies`,
   retrieves the shipping doc, and answers from it (not from memory).

Click any tool chip under an agent message to see the exact arguments and the
raw result it grounded its answer on.

---

## What I'd change for production

- **An eval harness first.** A set of labeled conversation trajectories with
  expected tool calls and outcomes, scored on resolution rate, hallucination
  rate, and false-escalation rate — so correctness stops being vibes.
- **pgvector** for retrieval instead of fetching all docs and ranking in JS
  (fine at 6 docs, not at 6,000). Since we're already on Postgres, it's a small
  change behind the same `searchPolicies` contract.
- **Real auth** (email OTP) instead of order-number-plus-email as the identity
  check, and proper streaming, tracing on every tool call, and a real
  human-handoff queue.
```
