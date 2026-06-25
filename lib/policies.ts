import OpenAI from "openai";
import { sql } from "./db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const EMBEDDING_MODEL = "text-embedding-3-small";

// Embed a single piece of text. Used both by the seed script (to embed each
// policy doc once) and at query time (to embed the user's question).
export async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

type PolicyRow = { id: string; title: string; body: string; embedding: string };

// Retrieve the policy docs most relevant to a question. We only have ~6 docs,
// so we fetch them all and rank in JS — no vector index needed. At real scale
// this becomes a pgvector similarity query (noted in the README), but the
// retrieval *contract* the agent depends on stays identical.
export async function searchPolicies(
  query: string,
  topK = 2
): Promise<{ title: string; body: string; score: number }[]> {
  const queryEmbedding = await embed(query);

  const rows = (await sql`
    SELECT id, title, body, embedding FROM policies
  `) as PolicyRow[];

  return rows
    .map((row) => ({
      title: row.title,
      body: row.body,
      score: cosineSimilarity(queryEmbedding, JSON.parse(row.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
