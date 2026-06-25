import { POLICY_DOCS } from "./policies-data";

// Lightweight policy retrieval over Bookly's docs (lib/policies-data.ts).
//
// With only a handful of short docs, embedding-based search would be
// over-engineering: a keyword match returns the same doc. The grounding
// guarantee doesn't come from HOW we find the doc — it comes from the agent
// answering ONLY from the text we hand back (enforced in the system prompt).
// At real scale this function swaps to embeddings / pgvector behind the exact
// same signature, and nothing else changes.

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "i", "my", "to", "of", "for",
  "and", "on", "in", "can", "you", "your", "with", "how", "what", "when",
  "where", "it", "this", "that", "be", "have", "get",
]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

// Score each doc by how many of the question's meaningful words it contains,
// return the best matches.
export function searchPolicies(
  query: string,
  topK = 2
): { title: string; body: string; score: number }[] {
  const terms = tokenize(query);

  return POLICY_DOCS.map((doc) => {
    const haystack = (doc.title + " " + doc.body).toLowerCase();
    const score = terms.reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
    return { title: doc.title, body: doc.body, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
