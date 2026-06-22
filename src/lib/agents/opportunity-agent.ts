/**
 * Opportunity & Pipeline Intelligence Agent — Release 11
 *
 * Converts a qualified (Hot/Warm) trade show lead into an internal
 * trackable opportunity. This is internal pipeline tracking only — it does
 * NOT create or update anything in HubSpot. CRM sync remains a separate,
 * explicitly-approved workflow from Release 10.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import type { ScoreClassification, OpportunityStage, OpportunityPriority } from "@/db/schema";

// ─── Stage probability defaults ────────────────────────────────────────────

export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  identified: 0.10,
  qualified: 0.25,
  meeting_scheduled: 0.40,
  proposal_requested: 0.50,
  proposal_sent: 0.60,
  negotiation: 0.75,
  won: 1.00,
  lost: 0.00,
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OpportunityCreationResult {
  allowed: boolean;
  blockedReason?: string;
  requiresManagerOverride?: boolean;
  payload?: {
    opportunityName: string;
    companyName: string;
    contactName: string;
    stage: OpportunityStage;
    priority: OpportunityPriority;
    amount: number | null;
    probability: number;
    expectedRevenue: number | null;
    nextStep: string;
    riskNotes: string;
    aiRecommendation: string;
  };
}

// ─── Eligibility + payload preparation ─────────────────────────────────────

export async function createOpportunityFromLead(
  leadId: string,
  tenantId: string,
  options: { managerOverride?: boolean } = {}
): Promise<OpportunityCreationResult> {
  const leadRows = await db.select().from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId))).limit(1);
  if (!leadRows.length) throw new Error("Lead not found");
  const lead = leadRows[0];

  if (!lead.consentGiven) {
    return { allowed: false, blockedReason: "This lead has not given consent. Opportunities cannot be created without consent." };
  }

  const [score] = await db.select().from(schema.leadScores)
    .where(and(eq(schema.leadScores.leadId, leadId), eq(schema.leadScores.tenantId, tenantId)))
    .orderBy(desc(schema.leadScores.createdAt)).limit(1);

  if (!score) {
    return { allowed: false, blockedReason: "This lead has no score yet. Generate a lead score before creating an opportunity." };
  }

  const classification: ScoreClassification = score.classification;

  if (classification === "needs_review") {
    return { allowed: false, blockedReason: "This lead's score is classified as Needs Review. Opportunities cannot be created until the score is reviewed." };
  }

  if (classification === "cold" && !options.managerOverride) {
    return {
      allowed: false,
      requiresManagerOverride: true,
      blockedReason: "Cold leads should remain in nurture unless manually promoted by a manager.",
    };
  }

  // Defaults by classification
  let stage: OpportunityStage = "identified";
  let priority: OpportunityPriority = "medium";
  let probability = STAGE_PROBABILITY.identified;

  if (classification === "hot") {
    stage = "qualified"; priority = "high"; probability = 0.40;
  } else if (classification === "warm") {
    stage = "identified"; priority = "medium"; probability = 0.20;
  } else if (classification === "cold") {
    // manager override path — still starts at the bottom of the funnel
    stage = "identified"; priority = "low"; probability = STAGE_PROBABILITY.identified;
  }

  const amount = score.estimatedOpportunityValue != null ? parseFloat(score.estimatedOpportunityValue) : null;
  const expectedRevenue = amount != null ? Math.round(amount * probability) : null;

  // Gather context for AI next-step / risk notes
  const [insight] = await db.select().from(schema.conversationInsights)
    .where(and(eq(schema.conversationInsights.leadId, leadId), eq(schema.conversationInsights.tenantId, tenantId)))
    .orderBy(desc(schema.conversationInsights.createdAt)).limit(1);

  const [company] = await db.select().from(schema.companyEnrichment)
    .where(and(eq(schema.companyEnrichment.leadId, leadId), eq(schema.companyEnrichment.tenantId, tenantId)))
    .orderBy(desc(schema.companyEnrichment.updatedAt)).limit(1);

  const [followup] = await db.select().from(schema.followupRecommendations)
    .where(and(eq(schema.followupRecommendations.leadId, leadId), eq(schema.followupRecommendations.tenantId, tenantId)))
    .orderBy(desc(schema.followupRecommendations.createdAt)).limit(1);

  const [crmJob] = await db.select().from(schema.crmSyncJobs)
    .where(and(eq(schema.crmSyncJobs.leadId, leadId), eq(schema.crmSyncJobs.tenantId, tenantId)))
    .orderBy(desc(schema.crmSyncJobs.createdAt)).limit(1);

  const { nextStep, riskNotes, aiRecommendation } = await getAiRecommendation({
    lead, score, insight, company, followup, crmJobStatus: crmJob?.syncStatus ?? null,
  });

  return {
    allowed: true,
    payload: {
      opportunityName: `${lead.companyName} - Trade Show Opportunity`,
      companyName: lead.companyName,
      contactName: `${lead.firstName} ${lead.lastName ?? ""}`.trim(),
      stage, priority,
      amount, probability, expectedRevenue,
      nextStep, riskNotes, aiRecommendation,
    },
  };
}

// ─── AI recommendation (explanation only — never sets numeric fields) ─────

interface AiContext {
  lead: { firstName: string; lastName: string | null; jobTitle: string | null; companyName: string };
  score: { score: string; classification: ScoreClassification; recommendedNextAction: string | null };
  insight: { painPoints: unknown; businessNeed: string | null; timeline: string | null; summary: string | null } | undefined;
  company: { industry: string | null; employeeRange: string | null } | undefined;
  followup: { followupType: string; recommendedTiming: string } | undefined;
  crmJobStatus: string | null;
}

async function getAiRecommendation(ctx: AiContext): Promise<{ nextStep: string; riskNotes: string; aiRecommendation: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackRecommendation(ctx);
  }

  try {
    const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json" },
    });

    const painPoints = toArray(ctx.insight?.painPoints).join(", ") || "none captured";

    const prompt = `You are a RevOps consultant reviewing a new pipeline opportunity created from a trade show lead.

Lead: ${ctx.lead.firstName} ${ctx.lead.lastName ?? ""}, ${ctx.lead.jobTitle ?? "unknown title"} at ${ctx.lead.companyName}
Industry: ${ctx.company?.industry ?? "unknown"}
Company Size: ${ctx.company?.employeeRange ?? "unknown"}
Lead Score: ${ctx.score.score}/100 (${ctx.score.classification})
Recommended Next Action (from scoring): ${ctx.score.recommendedNextAction ?? "none"}
Pain Points: ${painPoints}
Business Need: ${ctx.insight?.businessNeed ?? "unknown"}
Timeline: ${ctx.insight?.timeline ?? "unknown"}
Conversation Summary: ${ctx.insight?.summary ?? "none captured"}
Existing Follow-Up Draft: ${ctx.followup ? `${ctx.followup.followupType} (${ctx.followup.recommendedTiming})` : "none"}
CRM Sync Status: ${ctx.crmJobStatus ?? "not synced"}

Return ONLY this JSON, no markdown:
{
  "next_step": "single specific next step for this opportunity",
  "risk_notes": "1-2 sentences on what could stall or kill this deal",
  "ai_recommendation": "1-2 sentence recommendation for the deal owner"
}`;

    const response = await model.generateContent([{ text: prompt }]);
    const rawText = response.response.text();
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    return {
      nextStep: typeof parsed.next_step === "string" && parsed.next_step ? parsed.next_step : fallbackRecommendation(ctx).nextStep,
      riskNotes: typeof parsed.risk_notes === "string" && parsed.risk_notes ? parsed.risk_notes : fallbackRecommendation(ctx).riskNotes,
      aiRecommendation: typeof parsed.ai_recommendation === "string" && parsed.ai_recommendation ? parsed.ai_recommendation : fallbackRecommendation(ctx).aiRecommendation,
    };
  } catch {
    return fallbackRecommendation(ctx);
  }
}

function fallbackRecommendation(ctx: AiContext): { nextStep: string; riskNotes: string; aiRecommendation: string } {
  return {
    nextStep: ctx.score.recommendedNextAction || "Follow up with the prospect to confirm next steps.",
    riskNotes: "AI recommendation unavailable — review manually for risks (budget, timeline, competing priorities).",
    aiRecommendation: `Classified as ${ctx.score.classification} — prioritize outreach accordingly.`,
  };
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}

// ─── Activity logging helper ───────────────────────────────────────────────

export async function logOpportunityActivity(params: {
  tenantId: string;
  opportunityId: string;
  leadId: string;
  userId?: string | null;
  activityType: schema.OpportunityActivityType;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(schema.opportunityActivities).values({
    tenantId: params.tenantId,
    opportunityId: params.opportunityId,
    leadId: params.leadId,
    createdByUserId: params.userId ?? null,
    activityType: params.activityType,
    description: params.description,
    metadata: params.metadata ?? null,
  });
}
