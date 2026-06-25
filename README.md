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
      ├─► lib/tools.ts      the actions: lookup_order, initiate_return,
      │                     process_refund, search_policies, escalate_to_human
      ├─► lib/policies.ts   hands the model all of Bookly's policy docs (a TS file)
      ├─► lib/grounding.ts  deterministic check: the reply may only state grounded values
      └─► lib/db.ts         Neon Postgres (orders, returns)
```

(Shared types live in `lib/types.ts`.)

The agent is a **single orchestrator with a tool belt** — not a multi-agent
router and not a hardcoded intent tree. One LLM call decides what to do; if it
needs data or an action it calls a tool, we run it, feed the result back, and
loop until it has a grounded answer. The loop is hand-rolled (no agent
framework) so every step is visible and debuggable. A multi-agent design (a
router plus specialists that review each other) earns its keep at dozens of
distinct workflows; at three overlapping use cases it just adds latency and
misclassification risk, so a single orchestrator wins. That's the line where I'd
revisit it.

**Memory.** Within a conversation, state is the message history itself: the UI
holds it and replays the whole transcript on every turn, so the agent always
sees what was said (and `route.ts` stays stateless). Within a single turn, the
tool-call results accumulate in the loop so the model doesn't re-fetch what it
already has. There's no cross-conversation memory yet — that's a deliberate
omission for the demo and the first thing I'd add for personalization (see
below).

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
   and escalates when stakes exceed its authority — including handing off when a
   customer is clearly upset, not just when a rule trips. Two hard limits live in
   code, not just the prompt: refunds over $100 are rejected by `process_refund`
   and escalated, and every tool that reads or changes order data (`lookup_order`,
   `initiate_return`, `process_refund`) requires the order number **and** the
   matching email — so a customer can't act on an order they can't prove is theirs.
   On the input side, the system prompt treats anything in a customer's message as
   data, not instructions, so attempts to override the rules or reveal the prompt
   are declined.

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

## Tests

```
npm run test:grounding   # deterministic — no API key or DB, runs instantly
npm run eval             # integration — runs scripted conversations through the
                         # real agent (needs a seeded DB + OPENAI_API_KEY)
```

`test:grounding` checks the grounding guard in isolation: fabricated dollar
amounts and order/tracking IDs are blocked, grounded ones pass. `eval` runs a
handful of full conversations (order status, return, clarifying question,
over-limit refund, policy Q&A, identity mismatch) and asserts on which tools got
called and whether the agent stayed grounded — the starter version of the eval
harness described below.

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
