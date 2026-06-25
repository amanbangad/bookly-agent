import { POLICY_DOCS } from "./policies-data";

// Policy "retrieval" for Bookly's docs (lib/policies-data.ts).
//
// At this scale the entire policy set is ~6 short docs that fit easily in the
// model's context, so the most accurate thing we can do is hand the model ALL
// of them and let it pick the relevant part — the answering model IS the
// retriever. This beats keyword or embedding filtering here because filtering
// can return the WRONG doc (or none), leaving the agent grounded on bad text;
// returning everything means the right policy is always present, and the model
// matches on meaning, not string overlap ("send it back" -> Returns).
//
// `query` is intentionally unused today — it's the seam where embedding-based
// ranking drops in once the corpus is too large to send wholesale (see README).
export function searchPolicies(query: string): { title: string; body: string }[] {
  return POLICY_DOCS.map((doc) => ({ title: doc.title, body: doc.body }));
}
