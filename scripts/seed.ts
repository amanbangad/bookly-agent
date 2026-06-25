import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // same env file Next.js uses
import { neon } from "@neondatabase/serverless";

// Run once: `npm run seed`. Re-runnable — it drops and recreates the tables.
// Only needs DATABASE_URL now (policies are read from a file, not the DB).
const sql = neon(process.env.DATABASE_URL!);

const ORDERS = [
  {
    order_id: "BK-1001",
    customer_email: "ada@example.com",
    status: "shipped",
    items: "The Pragmatic Programmer",
    tracking: "1Z999AA10123456784",
    total: "42.00",
    placed_at: "2026-06-12",
  },
  {
    order_id: "BK-1002",
    customer_email: "ada@example.com",
    status: "delivered",
    items: "Designing Data-Intensive Applications",
    tracking: "1Z999AA10123456785",
    total: "58.00",
    placed_at: "2026-05-28",
  },
  {
    order_id: "BK-1003",
    customer_email: "grace@example.com",
    status: "processing",
    items: "Project Hail Mary, Dune",
    tracking: null,
    total: "31.50",
    placed_at: "2026-06-20",
  },
  {
    order_id: "BK-1004",
    customer_email: "linus@example.com",
    status: "delivered",
    items: "Clean Code (damaged on arrival)",
    tracking: "1Z999AA10123456786",
    total: "150.00",
    placed_at: "2026-06-01",
  },
  {
    order_id: "BK-1005",
    customer_email: "grace@example.com",
    status: "shipped",
    items: "The Midnight Library",
    tracking: "1Z999AA10123456787",
    total: "18.99",
    placed_at: "2026-06-18",
  },
];

async function main() {
  console.log("Dropping and recreating tables...");
  await sql`DROP TABLE IF EXISTS returns`;
  await sql`DROP TABLE IF EXISTS orders`;
  await sql`DROP TABLE IF EXISTS policies`; // cleanup if an older seed created it

  await sql`
    CREATE TABLE orders (
      order_id TEXT PRIMARY KEY,
      customer_email TEXT NOT NULL,
      status TEXT NOT NULL,
      items TEXT NOT NULL,
      tracking TEXT,
      total NUMERIC NOT NULL,
      placed_at DATE NOT NULL
    )
  `;

  await sql`
    CREATE TABLE returns (
      return_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      reason TEXT,
      refund_amount NUMERIC,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  console.log("Seeding orders...");
  for (const o of ORDERS) {
    await sql`
      INSERT INTO orders (order_id, customer_email, status, items, tracking, total, placed_at)
      VALUES (${o.order_id}, ${o.customer_email}, ${o.status}, ${o.items}, ${o.tracking}, ${o.total}, ${o.placed_at})
    `;
  }

  console.log(`Done. Seeded ${ORDERS.length} orders.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
