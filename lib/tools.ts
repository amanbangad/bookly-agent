import OpenAI from "openai";
import { sql } from "./db";
import { searchPolicies } from "./policies";

// Refunds at or below this auto-process; anything higher must go to a human.
// This limit is enforced HERE, in code — not just requested in the prompt — so
// the model cannot talk its way past it. The prompt and the tool agree, but
// the tool is the one that's load-bearing.
const REFUND_AUTO_APPROVE_LIMIT = 100;

type Order = {
  order_id: string;
  customer_email: string;
  status: string;
  items: string;
  tracking: string | null;
  total: string;
  placed_at: string;
};

const IDENTITY_MISMATCH =
  "No order matches that order number and email together. Ask the customer to double-check both.";

async function verifyOrderIdentity(order_id: string, email: string) {
  const rows = (await sql`
    SELECT * FROM orders
    WHERE order_id = ${order_id}
      AND lower(customer_email) = lower(${email})
  `) as Order[];

  if (rows.length === 0) {
    // Note we don't reveal whether the order number OR the email was wrong —
    // requiring both is our lightweight identity check.
    return { ok: false as const, message: IDENTITY_MISMATCH };
  }
  return { ok: true as const, order: rows[0] };
}

// ---------------------------------------------------------------------------
// Tool implementations. Each returns a JSON string that is fed back to the
// model as the tool result. Returning structured, factual data (not prose) is
// what lets the model ground its reply instead of inventing details.
// ---------------------------------------------------------------------------

async function lookupOrder(args: { order_id: string; email: string }) {
  const result = await verifyOrderIdentity(args.order_id, args.email);
  if (!result.ok) {
    return JSON.stringify({ found: false, message: result.message });
  }
  return JSON.stringify({ found: true, order: result.order });
}

async function getOrdersByEmail(args: { email: string }) {
  const rows = (await sql`
    SELECT order_id, status, placed_at FROM orders
    WHERE lower(customer_email) = lower(${args.email})
    ORDER BY placed_at DESC
  `) as Pick<Order, "order_id" | "status" | "placed_at">[];

  return JSON.stringify({
    count: rows.length,
    orders: rows,
    note:
      rows.length === 0
        ? "No orders on file for that email."
        : "Found order numbers for this email. Confirm full details with lookup_order before sharing them.",
  });
}

async function initiateReturn(args: { order_id: string; email: string; reason: string }) {
  const result = await verifyOrderIdentity(args.order_id, args.email);
  if (!result.ok) {
    return JSON.stringify({ success: false, message: result.message });
  }

  const { order } = result;
  const returnId = "RMA-" + Math.floor(100000 + Math.random() * 900000);
  await sql`
    INSERT INTO returns (return_id, order_id, reason, refund_amount, status)
    VALUES (${returnId}, ${args.order_id}, ${args.reason}, ${order.total}, 'label_sent')
  `;

  return JSON.stringify({
    success: true,
    return_id: returnId,
    message: `Return started. A prepaid label was emailed to ${order.customer_email}. Refund of $${order.total} issues to the original payment method once the book is received.`,
  });
}

async function processRefund(args: { order_id: string; email: string; amount: number }) {
  // The guardrail. Above the limit we refuse to auto-process and tell the
  // agent to escalate — regardless of what the conversation pressured it to do.
  if (args.amount > REFUND_AUTO_APPROVE_LIMIT) {
    return JSON.stringify({
      success: false,
      requires_human: true,
      message: `Refunds over $${REFUND_AUTO_APPROVE_LIMIT} need a specialist's approval. Do not promise this refund — escalate it instead.`,
    });
  }

  const result = await verifyOrderIdentity(args.order_id, args.email);
  if (!result.ok) {
    return JSON.stringify({ success: false, message: result.message });
  }

  await sql`UPDATE orders SET status = 'refunded' WHERE order_id = ${args.order_id}`;
  return JSON.stringify({
    success: true,
    message: `Refund of $${args.amount} issued to the original payment method. Funds typically appear within 5-10 business days.`,
  });
}

async function searchPoliciesTool(args: { query: string }) {
  const results = await searchPolicies(args.query);
  return JSON.stringify({
    policies: results.map((r) => ({ title: r.title, body: r.body })),
    note: "Answer using ONLY the text above. If it isn't covered, say so.",
  });
}

async function escalateToHuman(args: { reason: string; summary: string }) {
  // Mocked handoff. In production this opens a ticket / routes to a live queue.
  const ticketId = "TICKET-" + Math.floor(10000 + Math.random() * 90000);
  return JSON.stringify({
    escalated: true,
    ticket_id: ticketId,
    message: `Handed off to a human specialist (${ticketId}). They'll follow up by email within one business day.`,
  });
}

// ---------------------------------------------------------------------------
// Tool schemas exposed to the model, plus a dispatch map.
// ---------------------------------------------------------------------------

export const TOOL_SCHEMAS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "lookup_order",
      description:
        "Look up a single order's full status and details. Requires BOTH the order number and the email on the order — this is how we verify identity before sharing any order information.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "e.g. BK-1001" },
          email: { type: "string", description: "Email on the order" },
        },
        required: ["order_id", "email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orders_by_email",
      description:
        "List a customer's order numbers by email when they don't have their order number handy. Returns order numbers and statuses only.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "initiate_return",
      description:
        "Start a return for an order. Requires BOTH the order number and the email on the order to verify identity. Only call after confirming which order and the reason with the customer. Creates a return record and emails a prepaid label.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          email: { type: "string", description: "Email on the order — required to verify identity" },
          reason: { type: "string", description: "Why the customer is returning it" },
        },
        required: ["order_id", "email", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "process_refund",
      description:
        "Issue an immediate refund to the original payment method (e.g. a damaged item the customer keeps). Requires BOTH the order number and the email on the order to verify identity. Refunds over $100 will be rejected and must be escalated.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          email: { type: "string", description: "Email on the order — required to verify identity" },
          amount: { type: "number", description: "Refund amount in dollars" },
        },
        required: ["order_id", "email", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_policies",
      description:
        "Search Bookly's policy docs (shipping, returns, refunds, password reset, payment, contact) to answer a general question. Use this for ANY policy question — never answer policy from memory.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Hand off to a human specialist. Use when the request is outside your tools, when a refund exceeds the auto-approve limit, or when you cannot resolve the issue safely.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
          summary: { type: "string", description: "Short summary of the issue for the human" },
        },
        required: ["reason", "summary"],
      },
    },
  },
];

type ToolFn = (args: any) => Promise<string>;

const TOOL_IMPLS: Record<string, ToolFn> = {
  lookup_order: lookupOrder,
  get_orders_by_email: getOrdersByEmail,
  initiate_return: initiateReturn,
  process_refund: processRefund,
  search_policies: searchPoliciesTool,
  escalate_to_human: escalateToHuman,
};

export async function executeTool(name: string, args: any): Promise<string> {
  const impl = TOOL_IMPLS[name];
  if (!impl) return JSON.stringify({ error: `Unknown tool: ${name}` });
  try {
    return await impl(args);
  } catch (err) {
    return JSON.stringify({
      error: "Tool failed to run.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
