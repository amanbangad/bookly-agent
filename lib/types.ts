export type ToolTrace = {
  name: string;
  args: Record<string, unknown>;
  result: string;
};

export type AgentResult = {
  reply: string;
  trace: ToolTrace[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  trace?: ToolTrace[];
};
