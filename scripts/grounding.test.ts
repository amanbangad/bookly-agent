import { findUnsupportedValues } from "../lib/grounding";

// Deterministic test of the grounding check — no API key, no DB, runs instantly.
// `npm run test:grounding`. Proves the guard catches fabricated money/IDs while
// letting through anything that traces to a tool result or the customer's words.

// Stand-in for one turn's sources: a lookup_order result + the customer's message.
const sources = `
{"found":true,"order":{"order_id":"BK-1001","customer_email":"ada@example.com","status":"shipped","total":"42.00","tracking":"1Z999AA10123456784"}}
my order is BK-1001, email ada@example.com
`;

type Case = { label: string; reply: string; shouldBlock: boolean };

const cases: Case[] = [
  { label: "grounded reply (real order/total/tracking)", shouldBlock: false,
    reply: "Your order BK-1001 shipped — total $42.00, tracking 1Z999AA10123456784." },
  { label: "fabricated refund amount", shouldBlock: true,
    reply: "Good news! I've refunded $45.00 to your card." },
  { label: "fabricated order id", shouldBlock: true,
    reply: "I found your order BK-9999, it's on the way." },
  { label: "fabricated tracking number", shouldBlock: true,
    reply: "It shipped with tracking 1Z000FAKE99999999." },
  { label: "echoes the id the CUSTOMER provided", shouldBlock: false,
    reply: "Thanks — can you confirm the email on BK-1001?" },
  { label: "no risky values at all", shouldBlock: false,
    reply: "Happy to help! What's your order number and email?" },
];

let failures = 0;
for (const c of cases) {
  const unsupported = findUnsupportedValues(c.reply, sources);
  const blocked = unsupported.length > 0;
  const pass = blocked === c.shouldBlock;
  if (!pass) failures++;
  const tag = pass ? "PASS" : "FAIL";
  const detail = blocked ? `blocked [${unsupported.join(", ")}]` : "allowed";
  console.log(`${tag}  ${c.label.padEnd(42)} ${detail}`);
}

console.log(`\n${cases.length - failures}/${cases.length} passed`);
if (failures > 0) process.exit(1);
