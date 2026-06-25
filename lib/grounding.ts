import type { ToolTrace } from "./types";

// The grounding check lives in its own module on purpose: it has no DB or LLM
// dependency, so it's pure, deterministic, and unit-testable with zero setup
// (see scripts/grounding.test.ts). agent.ts calls it as the last step of a turn.

// Minimal shape we need from a conversation message — kept structural so this
// module doesn't depend on the OpenAI SDK.
type MinimalMessage = { role: string; content?: unknown };

// Everything the reply is ALLOWED to draw facts from this turn: the raw tool
// results, plus what the customer themselves typed (so echoing the order number
// they just gave us is fine).
export function collectSources(trace: ToolTrace[], messages: MinimalMessage[]): string {
  const toolText = trace.map((t) => t.result).join("\n");
  const userText = messages
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .map((m) => m.content as string)
    .join("\n");
  return toolText + "\n" + userText;
}

// Deterministic, no-LLM grounding check. Returns any high-risk values in the
// reply that don't trace back to the sources. We only police the values that
// actually hurt if fabricated — money and identifiers — to keep false positives
// near zero. This is a net under the prompt-level rules, not a replacement.
export function findUnsupportedValues(reply: string, sources: string): string[] {
  const unsupported: string[] = [];

  // Money: compare by numeric value, so a reply's "$42" is supported by a tool
  // result's "42.00". Allowed numbers = every number appearing in the sources.
  const allowedNumbers = new Set((sources.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  for (const m of reply.matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)) {
    if (!allowedNumbers.has(Number(m[1]))) unsupported.push("$" + m[1]);
  }

  // Identifiers: order / RMA / ticket / tracking tokens must appear verbatim.
  const lowerSources = sources.toLowerCase();
  for (const m of reply.matchAll(/\b(?:BK-\d+|RMA-\d+|TICKET-\d+|1Z[A-Z0-9]{6,})\b/gi)) {
    if (!lowerSources.includes(m[0].toLowerCase())) unsupported.push(m[0]);
  }

  return unsupported;
}
