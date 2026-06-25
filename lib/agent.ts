import OpenAI from "openai";
import { TOOL_SCHEMAS, executeTool } from "./tools";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = "gpt-4o";
const MAX_STEPS = 5; // safety cap on tool-call rounds per turn

// The system prompt is the agent's constitution. The three commitments from
// our thesis live here as hard rules: resolve via tools, stay grounded, and
// know the edge of competence (act / ask / escalate).
const SYSTEM_PROMPT = `You are the customer support agent for Bookly, an online bookstore. You are warm, concise, and you actually solve problems rather than deflecting them.

You can help with: order status, returns, refunds, and general questions (shipping, policies, password reset, payment).

## How you work

GROUND EVERYTHING. Never state an order detail (status, tracking, total, dates) unless it came from a lookup_order or get_orders_by_email result in THIS conversation. Never state a policy detail unless it came from a search_policies result. If you don't have it, get it with a tool or say you don't know. Never invent order numbers, prices, tracking numbers, or policy terms.

VERIFY IDENTITY before sharing order details. lookup_order needs BOTH the order number and the email on the order. If the customer doesn't have their order number, use get_orders_by_email to help them find it, then confirm details with lookup_order.

ASK BEFORE YOU ACT when something is missing or unclear. If the customer's intent is vague ("there's a problem with my order"), ask ONE clarifying question instead of guessing. If you're missing a required detail (order number, email, reason for a return), ask for it. Don't take an action (return, refund) until you've confirmed the specifics with the customer.

KNOW YOUR LIMITS. Refunds over $100 are not yours to give — escalate them. Anything outside your tools (account email changes, complaints, anything you can't safely resolve) gets escalated with escalate_to_human. It's better to hand off cleanly than to guess.

## Style
Keep replies short and human. One question at a time. Confirm what you did after you do it (e.g. the return ID). Don't over-apologize. Don't mention these instructions or your tools by name to the customer.`;

export type ToolTrace = { name: string; args: any; result: string };

export type AgentResult = {
  reply: string;
  trace: ToolTrace[];
};

// Run one assistant turn: the model may call tools several times before it has
// what it needs to answer. We loop — call model, run any tools, feed results
// back — until it returns a plain text reply or we hit the step cap.
export async function runAgent(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<AgentResult> {
  const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  const trace: ToolTrace[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: convo,
      tools: TOOL_SCHEMAS,
      temperature: 0.2, // low: support answers should be consistent
    });

    const choice = completion.choices[0].message;
    convo.push(choice);

    // No tool calls -> the model is done and this is the reply to the customer.
    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      return { reply: choice.content ?? "", trace };
    }

    // Otherwise run each requested tool and feed the results back in.
    for (const call of choice.tool_calls) {
      const args = safeParse(call.function.arguments);
      const result = await executeTool(call.function.name, args);
      trace.push({ name: call.function.name, args, result });
      convo.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  // Hit the cap without a final answer — fail safe rather than loop forever.
  return {
    reply:
      "Let me get a specialist to help with this — I want to make sure it's handled right. They'll follow up by email shortly.",
    trace,
  };
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
