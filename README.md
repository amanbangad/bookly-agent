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

1. **Resolve, don't deflect.** Tools change real state (`initiate_return` writes
   a row and returns an RMA), they don't just look things up.

2. **Grounded or silent.** Order facts come from tool results, policy answers
   from Bookly's actual docs — never the model's memory. The grounding holds
   because the agent answers only from text we hand it. As a deterministic net
   under that, a **grounding check** in `agent.ts` (`findUnsupportedValues`)
   scans every reply before it sends: any dollar amount or order / RMA / tracking
   ID that doesn't trace to a tool result or the customer's own words gets the
   reply held and handed to a human. No LLM call, near-zero false positives — a
   guard that can't itself hallucinate.

3. **Know the edge.** The agent asks when info is missing or intent is unclear,
   and escalates when stakes exceed its authority. Two hard limits live in code,
   not just the prompt: refunds over $100 are rejected by `process_refund` and
   escalated, and every tool that reads or changes order data (`lookup_order`,
   `initiate_return`, `process_refund`) requires the order number **and** the
   matching email — so a customer can't act on an order they can't prove is theirs.

---

## Run it locally

**Prerequisites:** Node 18+, an OpenAI API key, a Neon Postgres database
(free tier is fine — copy its connection string).

```
# 1. install
npm install

# 2. configure — create .env.local with your two secrets
cp .env.example .env.local
#   then edit .env.local:
#   OPENAI_API_KEY=sk-...
#   DATABASE_URL=postgresql://...   (your Neon connection string)

# 3. create tables + seed the fake orders (run once; only needs DATABASE_URL)
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

1. **Multi-turn + identity check** — "Where's my order?" → the agent asks for the
   order number *and* email before it looks anything up → give `BK-1001` /
   `ada@example.com` → it calls `lookup_order` and reports the real status.

2. **Taking a real action (tool use)** — following on, "I want to return it, I
   changed my mind" → it confirms the order and reason, verifies the same order
   number + email, calls `initiate_return`, and a row is written to the `returns`
   table with a real RMA number.

3. **Clarifying question** — "There's a problem with my order" → instead of
   guessing, it asks *what kind* of problem before doing anything.

4. **Guardrail / escalation** — ask for a $150 refund on BK-1004 → `process_refund`
   rejects it (over the $100 limit) and the agent escalates to a human instead of
   promising money it can't give.

5. **Grounded policy Q&A** — "Do you ship to Canada?" → it calls `search_policies`
   and answers from the returned doc, not from memory.

Click any tool chip under an agent message to see the exact arguments and the raw
result it grounded its answer on — including a `⚠️ grounding_check` chip on any
reply the grounding net holds back.

---

## What I'd change for production

- **An eval harness first.** A set of labeled conversation trajectories with
  expected tool calls and outcomes, scored on resolution rate, hallucination
  rate, and false-escalation rate — so correctness stops being vibes.
- **Regenerate instead of escalating** when the grounding check fires. Today a
  blocked reply hands off to a human (safe but blunt); in production I'd re-prompt
  the model with the specific unsupported values and only escalate if it still
  can't ground them. I'd also add an LLM grounding verifier for claims that aren't
  simple values (e.g. a paraphrased policy), which the deterministic check can't catch.
- **Embedding-based retrieval (pgvector)** once the policy set grows past a handful
  of docs. Today the whole policy set fits in context, so we hand the model all of
  it and let it pick; at thousands of docs you'd embed them and let Postgres do
  similarity search, behind the same `searchPolicies` signature.
- **Real auth** (email OTP) instead of order-number-plus-email as the identity
  check, plus streaming, tracing on every tool call, and a real human-handoff queue.
