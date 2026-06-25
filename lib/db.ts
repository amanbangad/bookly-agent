import { neon } from "@neondatabase/serverless";

// One shared SQL client. The Neon serverless driver talks to Postgres over
// HTTP, so it works cleanly inside Vercel functions (no TCP pool to exhaust
// on cold starts). Tagged-template calls are automatically parameterized,
// so there is no SQL-injection surface from user input.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

export const sql = neon(process.env.DATABASE_URL);
