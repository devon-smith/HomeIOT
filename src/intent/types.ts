export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ExecutionResult {
  tool: string;
  ok: boolean;
  message: string;
  state?: unknown;
}

export interface IntentResult {
  route: "fast" | "llm" | "error";
  toolCalls: ToolCall[];
  results: ExecutionResult[];
  response: string;
  latencyMs: number;
}
