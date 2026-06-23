/**
 * Orchestrator engine — Release 13.
 *
 * Runs the "Lead Qualification Workflow": Conversation Intelligence →
 * Company Enrichment → Lead Scoring → Follow-Up Intelligence →
 * CRM Recommendation → ROI Attribution, in that order, against the
 * AGENT_ADAPTERS registered in agents.ts.
 *
 * This engine executes steps synchronously, in-process, within a single
 * request. That is intentional for this release — the AgentAdapter
 * interface (types.ts) is the seam that lets a future release swap this
 * loop for AWS Step Functions or Bedrock AgentCore without touching the
 * workflow definition, the database schema, or any UI built against
 * getWorkflowStatus().
 */

import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { AGENT_ADAPTERS, getAdapter } from "./agents";
import { RETRY_DELAYS_SECONDS } from "./types";
import type { AgentExecutionContext } from "./types";

const WORKFLOW_NAME = "lead_qualification";

export async function startWorkflow(leadId: string, tenantId: string, userId: string | null) {
  const leadRows = await db.select().from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId))).limit(1);
  if (!leadRows.length) throw new Error("Lead not found");
  const lead = leadRows[0];

  const [run] = await db.insert(schema.workflowRuns).values({
    tenantId, leadId, eventId: lead.eventId ?? null,
    workflowName: WORKFLOW_NAME,
    status: "running",
    startedAt: new Date(),
    currentStep: 0,
    totalSteps: AGENT_ADAPTERS.length,
    createdByUserId: userId,
  }).returning();

  await logAudit({
    tenantId, userId, action: "workflow_started", resourceType: "workflow_run", resourceId: run.id,
    metadata: { leadId, workflowName: WORKFLOW_NAME, totalSteps: AGENT_ADAPTERS.length },
  });

  const priorOutputs: Record<string, unknown> = {};
  let workflowFailed = false;
  let failureReason: string | null = null;

  for (let i = 0; i < AGENT_ADAPTERS.length; i++) {
    const adapter = AGENT_ADAPTERS[i];

    await db.update(schema.workflowRuns).set({ currentStep: i + 1, updatedAt: new Date() }).where(eq(schema.workflowRuns.id, run.id));

    const execResult = await runStep(adapter.agentName, {
      workflowId: run.id, tenantId, leadId, eventId: lead.eventId ?? null, userId, stepOrder: i + 1, priorOutputs,
    });

    if (execResult.status === "completed" && execResult.output) {
      priorOutputs[adapter.agentName] = execResult.output;
    }

    if (execResult.status === "failed" && adapter.critical) {
      workflowFailed = true;
      failureReason = execResult.error ?? `${adapter.agentName} failed`;
      break;
    }
  }

  const finalStatus = workflowFailed ? "failed" : "completed";
  const [updated] = await db.update(schema.workflowRuns).set({
    status: finalStatus,
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(schema.workflowRuns.id, run.id)).returning();

  await logAudit({
    tenantId, userId,
    action: finalStatus === "failed" ? "workflow_failed" : "workflow_completed",
    resourceType: "workflow_run", resourceId: run.id,
    metadata: { leadId, reason: failureReason },
  });

  return updated;
}

interface RunStepParams {
  workflowId: string;
  tenantId: string;
  leadId: string;
  eventId: string | null;
  userId: string | null;
  stepOrder: number;
  priorOutputs: Record<string, unknown>;
}

async function runStep(agentName: string, params: RunStepParams) {
  const adapter = getAdapter(agentName);
  if (!adapter) throw new Error(`No adapter registered for agent "${agentName}"`);

  const [registryRow] = await db.select().from(schema.agentRegistry).where(eq(schema.agentRegistry.agentName, agentName)).limit(1);
  if (registryRow?.status === "inactive") {
    const [skipped] = await db.insert(schema.agentExecutions).values({
      tenantId: params.tenantId, leadId: params.leadId, eventId: params.eventId, workflowId: params.workflowId,
      agentName, stepOrder: params.stepOrder, status: "skipped",
      errorMessage: "Agent is inactive in the registry", startedAt: new Date(), completedAt: new Date(), durationMs: 0,
    }).returning();
    return { status: "skipped" as const, error: skipped.errorMessage, executionId: skipped.id };
  }

  const ctx: AgentExecutionContext = {
    leadId: params.leadId, tenantId: params.tenantId, eventId: params.eventId, userId: params.userId, priorOutputs: params.priorOutputs,
  };

  const [execRow] = await db.insert(schema.agentExecutions).values({
    tenantId: params.tenantId, leadId: params.leadId, eventId: params.eventId, workflowId: params.workflowId,
    agentName, stepOrder: params.stepOrder, status: "running",
    startedAt: new Date(), inputPayload: { priorOutputs: params.priorOutputs },
  }).returning();

  await logAudit({
    tenantId: params.tenantId, userId: params.userId, action: "agent_started", resourceType: "agent_execution", resourceId: execRow.id,
    metadata: { agentName, leadId: params.leadId, stepOrder: params.stepOrder },
  });

  const startedAt = Date.now();
  try {
    const result = await adapter.execute(ctx);
    const durationMs = Date.now() - startedAt;

    const [updated] = await db.update(schema.agentExecutions).set({
      status: result.status, completedAt: new Date(), durationMs,
      outputPayload: result.output ?? null, errorMessage: result.error ?? null,
    }).where(eq(schema.agentExecutions.id, execRow.id)).returning();

    await logAudit({
      tenantId: params.tenantId, userId: params.userId,
      action: result.status === "failed" ? "agent_failed" : "agent_completed",
      resourceType: "agent_execution", resourceId: execRow.id,
      metadata: { agentName, status: result.status, durationMs },
    });

    return { status: result.status, error: result.error, executionId: updated.id, output: result.output };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Agent execution failed";

    await db.update(schema.agentExecutions).set({
      status: "failed", completedAt: new Date(), durationMs, errorMessage: message,
    }).where(eq(schema.agentExecutions.id, execRow.id));

    await logAudit({
      tenantId: params.tenantId, userId: params.userId, action: "agent_failed", resourceType: "agent_execution", resourceId: execRow.id,
      metadata: { agentName, error: message, durationMs },
    });

    return { status: "failed" as const, error: message, executionId: execRow.id };
  }
}

/** Re-runs a single failed agent_executions row, respecting max retries and failure class. */
export async function retryStep(executionId: string, tenantId: string, userId: string | null) {
  const [execRow] = await db.select().from(schema.agentExecutions)
    .where(and(eq(schema.agentExecutions.id, executionId), eq(schema.agentExecutions.tenantId, tenantId))).limit(1);
  if (!execRow) throw new Error("Execution not found");
  if (execRow.status !== "failed") throw new Error(`Execution is '${execRow.status}' — only failed steps can be retried`);

  const adapter = getAdapter(execRow.agentName);
  if (!adapter) throw new Error(`No adapter registered for agent "${execRow.agentName}"`);

  const [registryRow] = await db.select().from(schema.agentRegistry).where(eq(schema.agentRegistry.agentName, execRow.agentName)).limit(1);
  const maxRetries = registryRow?.maxRetries ?? 3;

  if (!registryRow?.supportsRetry) throw new Error(`${execRow.agentName} does not support retries`);
  if (execRow.retryCount >= maxRetries) throw new Error(`Max retries (${maxRetries}) reached for this step`);

  // Only temporary failures are retryable — validation/permission failures need a human fix, not a re-run.
  const failureClass = execRow.errorMessage ? adapter.classifyFailure(new Error(execRow.errorMessage)) : "temporary";
  if (failureClass !== "temporary") {
    throw new Error(`This failure looks like a ${failureClass} issue, not a temporary one — retrying won't help. Resolve the underlying issue first.`);
  }

  const requiredDelaySeconds = RETRY_DELAYS_SECONDS[Math.min(execRow.retryCount, RETRY_DELAYS_SECONDS.length - 1)];
  const earliestRetryAt = new Date((execRow.completedAt ?? execRow.createdAt).getTime() + requiredDelaySeconds * 1000);
  if (Date.now() < earliestRetryAt.getTime()) {
    throw new Error(`Retry available at ${earliestRetryAt.toLocaleTimeString()} (${requiredDelaySeconds}s backoff)`);
  }

  await logAudit({
    tenantId, userId, action: "retry_attempted", resourceType: "agent_execution", resourceId: execRow.id,
    metadata: { agentName: execRow.agentName, retryCount: execRow.retryCount + 1 },
  });

  const ctx: AgentExecutionContext = {
    leadId: execRow.leadId, tenantId, eventId: execRow.eventId, userId, priorOutputs: (execRow.inputPayload as { priorOutputs?: Record<string, unknown> } | null)?.priorOutputs ?? {},
  };

  const startedAt = Date.now();
  try {
    const result = await adapter.execute(ctx);
    const durationMs = Date.now() - startedAt;
    const [updated] = await db.update(schema.agentExecutions).set({
      status: result.status, completedAt: new Date(), durationMs, retryCount: execRow.retryCount + 1,
      outputPayload: result.output ?? null, errorMessage: result.error ?? null,
    }).where(eq(schema.agentExecutions.id, execRow.id)).returning();

    await logAudit({
      tenantId, userId, action: result.status === "failed" ? "agent_failed" : "agent_completed",
      resourceType: "agent_execution", resourceId: execRow.id,
      metadata: { agentName: execRow.agentName, status: result.status, retryCount: updated.retryCount },
    });

    return updated;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Agent execution failed";
    const [updated] = await db.update(schema.agentExecutions).set({
      status: "failed", completedAt: new Date(), durationMs, retryCount: execRow.retryCount + 1, errorMessage: message,
    }).where(eq(schema.agentExecutions.id, execRow.id)).returning();
    return updated;
  }
}

export async function cancelWorkflow(workflowId: string, tenantId: string, userId: string | null) {
  const [run] = await db.select().from(schema.workflowRuns)
    .where(and(eq(schema.workflowRuns.id, workflowId), eq(schema.workflowRuns.tenantId, tenantId))).limit(1);
  if (!run) throw new Error("Workflow not found");
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    throw new Error(`Workflow is already '${run.status}' — cannot cancel`);
  }

  const [updated] = await db.update(schema.workflowRuns).set({
    status: "cancelled", completedAt: new Date(), updatedAt: new Date(),
  }).where(eq(schema.workflowRuns.id, workflowId)).returning();

  await logAudit({
    tenantId, userId, action: "workflow_cancelled", resourceType: "workflow_run", resourceId: workflowId,
    metadata: { leadId: run.leadId },
  });

  return updated;
}

/**
 * Retries the most recent failed step of a workflow and, if that step now
 * succeeds, resumes execution of the remaining steps in order. Used by the
 * /workflows "Retry failed workflow" action.
 */
export async function resumeWorkflow(workflowId: string, tenantId: string, userId: string | null) {
  const [run] = await db.select().from(schema.workflowRuns)
    .where(and(eq(schema.workflowRuns.id, workflowId), eq(schema.workflowRuns.tenantId, tenantId))).limit(1);
  if (!run) throw new Error("Workflow not found");
  if (run.status !== "failed") throw new Error(`Workflow is '${run.status}' — only failed workflows can be retried`);

  const executions = await db.select().from(schema.agentExecutions)
    .where(eq(schema.agentExecutions.workflowId, workflowId))
    .orderBy(desc(schema.agentExecutions.stepOrder));

  const lastFailed = executions.find((e) => e.status === "failed");
  if (!lastFailed) throw new Error("No failed step found to retry");

  const retried = await retryStep(lastFailed.id, tenantId, userId);
  if (retried.status === "failed") {
    // Still failing — leave the workflow in 'failed' state.
    return { run, retriedExecution: retried };
  }

  // Step succeeded — resume from the next step onward.
  await db.update(schema.workflowRuns).set({ status: "running", updatedAt: new Date() }).where(eq(schema.workflowRuns.id, workflowId));

  const priorOutputs: Record<string, unknown> = {};
  for (const e of executions.sort((a, b) => a.stepOrder - b.stepOrder)) {
    if (e.outputPayload) priorOutputs[e.agentName] = e.outputPayload;
  }
  if (retried.outputPayload) priorOutputs[lastFailed.agentName] = retried.outputPayload;

  const remainingSteps = AGENT_ADAPTERS.filter((a) => {
    const stepOrder = AGENT_ADAPTERS.indexOf(a) + 1;
    return stepOrder > lastFailed.stepOrder;
  });

  let workflowFailed = false;
  let failureReason: string | null = null;

  for (const adapter of remainingSteps) {
    const stepOrder = AGENT_ADAPTERS.indexOf(adapter) + 1;
    await db.update(schema.workflowRuns).set({ currentStep: stepOrder, updatedAt: new Date() }).where(eq(schema.workflowRuns.id, workflowId));

    const execResult = await runStep(adapter.agentName, {
      workflowId, tenantId, leadId: run.leadId, eventId: run.eventId, userId, stepOrder, priorOutputs,
    });

    if (execResult.status === "completed" && execResult.output) priorOutputs[adapter.agentName] = execResult.output;

    if (execResult.status === "failed" && adapter.critical) {
      workflowFailed = true;
      failureReason = execResult.error ?? `${adapter.agentName} failed`;
      break;
    }
  }

  const finalStatus = workflowFailed ? "failed" : "completed";
  const [updated] = await db.update(schema.workflowRuns).set({
    status: finalStatus, completedAt: new Date(), updatedAt: new Date(),
  }).where(eq(schema.workflowRuns.id, workflowId)).returning();

  await logAudit({
    tenantId, userId, action: finalStatus === "failed" ? "workflow_failed" : "workflow_completed",
    resourceType: "workflow_run", resourceId: workflowId, metadata: { resumed: true, reason: failureReason },
  });

  return { run: updated, retriedExecution: retried };
}

export async function getWorkflowStatus(workflowId: string, tenantId: string) {
  const [run] = await db.select().from(schema.workflowRuns)
    .where(and(eq(schema.workflowRuns.id, workflowId), eq(schema.workflowRuns.tenantId, tenantId))).limit(1);
  if (!run) throw new Error("Workflow not found");

  const executions = await db.select().from(schema.agentExecutions)
    .where(eq(schema.agentExecutions.workflowId, workflowId))
    .orderBy(schema.agentExecutions.stepOrder);

  return { run, executions };
}

export async function getLatestWorkflowForLead(leadId: string, tenantId: string) {
  const [run] = await db.select().from(schema.workflowRuns)
    .where(and(eq(schema.workflowRuns.leadId, leadId), eq(schema.workflowRuns.tenantId, tenantId)))
    .orderBy(desc(schema.workflowRuns.createdAt)).limit(1);
  if (!run) return null;

  const executions = await db.select().from(schema.agentExecutions)
    .where(eq(schema.agentExecutions.workflowId, run.id))
    .orderBy(schema.agentExecutions.stepOrder);

  return { run, executions };
}
