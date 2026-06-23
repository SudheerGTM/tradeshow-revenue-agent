/**
 * Orchestrator core types — the adapter pattern this release establishes.
 *
 * AgentAdapter is the seam: today every adapter executes in-process inside
 * this Next.js server. Swapping the execution substrate later (AWS Step
 * Functions, Bedrock AgentCore, EventBridge) means writing a new class that
 * implements this same interface — the orchestrator engine, workflow
 * definitions, and database schema do not change. Nothing in
 * orchestrator.ts calls a concrete agent function directly; it only ever
 * calls `adapter.execute(ctx)`.
 */

export interface AgentExecutionContext {
  leadId: string;
  tenantId: string;
  eventId: string | null;
  userId: string | null;
  /** Outputs from prior steps in the same workflow run, keyed by agent name. */
  priorOutputs: Record<string, unknown>;
}

export type AgentRunStatus = "completed" | "failed" | "skipped";

export interface AgentRunResult {
  status: AgentRunStatus;
  output?: Record<string, unknown> | null;
  error?: string;
}

/** Classifies a failure so the retry engine knows whether retrying makes sense. */
export type FailureClass = "temporary" | "validation" | "permission";

export interface AgentAdapter {
  agentName: string;
  /** Whether this step's failure should stop the whole workflow. */
  critical: boolean;
  execute(ctx: AgentExecutionContext): Promise<AgentRunResult>;
  /** Best-effort classification of a thrown error, used by retry logic. */
  classifyFailure(error: unknown): FailureClass;
}

export const RETRY_DELAYS_SECONDS = [30, 60, 120] as const;

export function defaultClassifyFailure(error: unknown): FailureClass {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("permission") || message.includes("forbidden") || message.includes("unauthorized")) return "permission";
  if (message.includes("required") || message.includes("invalid") || message.includes("not found") || message.includes("no lead notes") || message.includes("no company name")) return "validation";
  return "temporary";
}
