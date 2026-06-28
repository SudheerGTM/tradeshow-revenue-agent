/**
 * Concrete agent adapters — the orchestrator only ever talks to these
 * through the AgentAdapter interface (see types.ts). Each adapter wraps an
 * existing, already-built agent function; no new AI behavior is introduced
 * here, only the orchestration seam around it.
 */

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { AgentAdapter, AgentExecutionContext, AgentRunResult } from "./types";
import { defaultClassifyFailure } from "./types";
import { runConversationIntelligenceFromNotes } from "@/lib/agents/conversation-agent";
import { runEnrichment } from "@/lib/agents/enrichment-agent";
import { scoreLead } from "@/lib/agents/lead-scoring";
import { generateFollowup } from "@/lib/agents/followup-agent";
import { prepareCRMRecord, upsertPendingCRMSyncJob } from "@/lib/agents/crm-sync-agent";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";
import { evaluatePolicy } from "./policies";
import { eventBus } from "./event-bus";
import { logAudit } from "@/lib/audit";

const conversationAgent: AgentAdapter = {
  agentName: "conversation_agent",
  critical: false,
  classifyFailure: defaultClassifyFailure,
  async execute(ctx): Promise<AgentRunResult> {
    try {
      const insight = await runConversationIntelligenceFromNotes(ctx.leadId, ctx.tenantId, ctx.userId);
      return { status: "completed", output: { insightId: insight.id, urgency: insight.urgency, confidenceScore: insight.confidenceScore } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversation analysis failed";
      if (message.includes("No lead notes")) return { status: "skipped", error: message };
      return { status: "failed", error: message };
    }
  },
};

const enrichmentAgent: AgentAdapter = {
  agentName: "enrichment_agent",
  critical: false,
  classifyFailure: defaultClassifyFailure,
  async execute(ctx): Promise<AgentRunResult> {
    try {
      const result = await runEnrichment(ctx.leadId, ctx.tenantId, ctx.userId);
      return { status: "completed", output: { companyStatus: result.company?.enrichmentStatus, contactStatus: result.contact?.enrichmentStatus, apolloSkipped: result.skipped } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enrichment failed";
      if (message.includes("no company name")) return { status: "skipped", error: message };
      return { status: "failed", error: message };
    }
  },
};

const leadScoringAgent: AgentAdapter = {
  agentName: "lead_scoring_agent",
  critical: true, // Follow-up requires a score to exist — stop the workflow if this fails.
  classifyFailure: defaultClassifyFailure,
  async execute(ctx): Promise<AgentRunResult> {
    const record = await scoreLead(ctx.leadId, ctx.tenantId, ctx.userId);
    await eventBus.publish({
      type: "lead_scored", tenantId: ctx.tenantId, leadId: ctx.leadId,
      payload: { score: record.score, classification: record.classification },
    });
    return {
      status: "completed",
      output: { score: record.score, classification: record.classification, confidenceScore: record.confidenceScore, expectedRevenue: record.expectedRevenue },
    };
  },
};

const followupAgent: AgentAdapter = {
  agentName: "followup_agent",
  critical: false,
  classifyFailure: defaultClassifyFailure,
  async execute(ctx): Promise<AgentRunResult> {
    const records = await generateFollowup(ctx.leadId, ctx.tenantId, ctx.userId);
    await eventBus.publish({
      type: "followup_generated", tenantId: ctx.tenantId, leadId: ctx.leadId,
      payload: { count: records.length },
    });
    return { status: "completed", output: { draftsCreated: records.length, types: records.map((r) => r.followupType) } };
  },
};

const crmSyncAgent: AgentAdapter = {
  agentName: "crm_sync_agent",
  critical: false,
  classifyFailure: defaultClassifyFailure,
  async execute(ctx): Promise<AgentRunResult> {
    // Policy check — e.g. "Lead score below 60 -> do not create CRM recommendation".
    const score = (ctx.priorOutputs["lead_scoring_agent"] as { score?: string } | undefined)?.score;
    const policyResult = await evaluatePolicy("crm_sync_agent", "threshold_block", { score: score != null ? parseFloat(score) : undefined });
    if (policyResult.blocked) {
      return { status: "skipped", error: policyResult.reason };
    }

    const preview = await prepareCRMRecord(ctx.leadId, ctx.tenantId);
    if (!preview.allowSync) {
      return { status: "skipped", error: preview.blockedReason ?? "CRM sync not allowed for this lead" };
    }

    const leadRows = await db.select({ eventId: schema.leads.eventId }).from(schema.leads).where(eq(schema.leads.id, ctx.leadId)).limit(1);

    const { job, wasExisting } = await db.transaction(async (tx) => {
      const result = await upsertPendingCRMSyncJob(tx, {
        tenantId: ctx.tenantId,
        eventId: leadRows[0]?.eventId ?? null,
        leadId: ctx.leadId,
        createdByUserId: ctx.userId,
        syncPayload: preview as unknown as Record<string, unknown>,
      });

      await logAudit({
        tenantId: ctx.tenantId, userId: ctx.userId,
        action: "crm_sync_prepared",
        resourceType: "crm_sync",
        resourceId: result.job.id,
        metadata: { leadId: ctx.leadId, classification: preview.classification, triggeredBy: "orchestrator", refreshedExisting: result.wasExisting },
      }, tx);

      return result;
    });

    return { status: "completed", output: { crmSyncJobId: job.id, classification: preview.classification, refreshedExisting: wasExisting } };
  },
};

const roiAgent: AgentAdapter = {
  agentName: "roi_agent",
  critical: false, // Explicitly optional per the spec — workflow continues if ROI attribution fails.
  classifyFailure: defaultClassifyFailure,
  async execute(ctx): Promise<AgentRunResult> {
    if (!ctx.eventId) return { status: "skipped", error: "Lead is not linked to an event" };
    const { result } = await recalculateAndStoreROI(ctx.eventId, ctx.tenantId, ctx.userId);
    await eventBus.publish({
      type: "roi_calculated", tenantId: ctx.tenantId, eventId: ctx.eventId,
      payload: { roiPercentage: result.roiPercentage, expectedRevenue: result.expectedRevenue },
    });
    return { status: "completed", output: { roiPercentage: result.roiPercentage, expectedRevenue: result.expectedRevenue } };
  },
};

export const AGENT_ADAPTERS: AgentAdapter[] = [
  conversationAgent, enrichmentAgent, leadScoringAgent, followupAgent, crmSyncAgent, roiAgent,
];

export function getAdapter(agentName: string): AgentAdapter | undefined {
  return AGENT_ADAPTERS.find((a) => a.agentName === agentName);
}
