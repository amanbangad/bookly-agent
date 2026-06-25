import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

// Node runtime (not edge) so the OpenAI SDK works without extra config.
// maxDuration gives the tool-call loop room to finish before Vercel times out.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
    }

    const result = await runAgent(messages);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong handling that message." },
      { status: 500 }
    );
  }
}
