/**
 * Follow-Up Intelligence Agent — Release 9
 *
 * Generates personalized follow-up drafts (email, LinkedIn, meeting request,
 * phone call recommendation) from lead, conversation intelligence, company
 * enrichment, and lead score data.
 *
 * This agent NEVER sends anything. It only produces drafts that require
 * human approval before any outreach happens.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import type { FollowupType, FollowupPriority, FollowupTiming, ScoreClassification } from "@/db/schema";

// ─── Types ─────────────────────────────────────────────────────────────────

interface FollowupContext {
  lead: {
    id: string;
    tenantId: string;
    eventId: string | null;
    firstName: string;
    lastName: string | null;
    jobTitle: string | null;
    companyName: string;
    notes: string | null;
  };
  insight: {
    painPoints: unknown;
    productInterest: unknown;
    businessNeed: string | null;
    urgency: string;
    timeline: string | null;
    nextBestAction: string | null;
    summary: string | null;
  } | null;
  company: {
    industry: string | null;
    employeeRange: string | null;
    headquarters: string | null;
  } | null;
  score: {
    id: string;
    score: string;
    classification: ScoreClassification;
    recommendedNextAction: string | null;
  } | null;
}

interface AiDraft {
  followupType: FollowupType;
  priority: FollowupPriority;
  recommendedTiming: FollowupTiming;
  subjectLine: string;
  messageContent: string;
  callToAction: string;
  reasoning: string;
  personalizationPoints: string[];
  confidenceScore: number;
  needsHumanReview: boolean;
}

interface StrategyPlan {
  types: FollowupType[];
  priority: FollowupPriority;
  timing: FollowupTiming;
  manualReviewOnly: boolean;
}

// ─── Strategy rules (classification-driven) ────────────────────────────────

function getStrategy(classification: ScoreClassification | null): StrategyPlan {
  switch (classification) {
    case "hot":
      return { types: ["email", "meeting_request"], priority: "high", timing: "immediate", manualReviewOnly: false };
    case "warm":
      return { types: ["email", "linkedin"], priority: "medium", timing: "24_hours", manualReviewOnly: false };
    case "cold":
      return { types: ["email"], priority: "low", timing: "1_week", manualReviewOnly: false };
    case "needs_review":
    default:
      return { types: [], priority: "low", timing: "1_week", manualReviewOnly: true };
  }
}

// ─── Public entry point ────────────────────────────────────────────────────

export async function generateFollowup(leadId: string, tenantId: string, userId: string) {
  // 1. Load lead
  const leadRows = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId)))
    .limit(1);
  if (!leadRows.length) throw new Error("Lead not found");
  const lead = leadRows[0];

  // 2. Latest CI insight
  const insightRows = await db
    .select()
    .from(schema.conversationInsights)
    .where(and(eq(schema.conversationInsights.leadId, leadId), eq(schema.conversationInsights.tenantId, tenantId)))
    .orderBy(desc(schema.conversationInsights.createdAt))
    .limit(1);
  const insight = insightRows[0] ?? null;

  // 3. Latest company enrichment
  const companyRows = await db
    .select()
    .from(schema.companyEnrichment)
    .where(and(eq(schema.companyEnrichment.leadId, leadId), eq(schema.companyEnrichment.tenantId, tenantId)))
    .orderBy(desc(schema.companyEnrichment.updatedAt))
    .limit(1);
  const company = companyRows[0] ?? null;

  // 4. Latest lead score
  const scoreRows = await db
    .select()
    .from(schema.leadScores)
    .where(and(eq(schema.leadScores.leadId, leadId), eq(schema.leadScores.tenantId, tenantId)))
    .orderBy(desc(schema.leadScores.createdAt))
    .limit(1);
  const score = scoreRows[0] ?? null;

  if (!score) {
    throw new Error("This lead has no score yet. Generate a lead score before creating follow-up drafts.");
  }

  const context: FollowupContext = {
    lead: {
      id: lead.id, tenantId: lead.tenantId, eventId: lead.eventId ?? null,
      firstName: lead.firstName, lastName: lead.lastName ?? null,
      jobTitle: lead.jobTitle ?? null, companyName: lead.companyName, notes: lead.notes ?? null,
    },
    insight: insight ? {
      painPoints: insight.painPoints,
      productInterest: insight.productInterest,
      businessNeed: insight.businessNeed,
      urgency: insight.urgency,
      timeline: insight.timeline,
      nextBestAction: insight.nextBestAction,
      summary: insight.summary,
    } : null,
    company: company ? {
      industry: company.industry,
      employeeRange: company.employeeRange,
      headquarters: company.headquarters,
    } : null,
    score: {
      id: score.id,
      score: score.score,
      classification: score.classification,
      recommendedNextAction: score.recommendedNextAction,
    },
  };

  await logAudit({
    tenantId, userId,
    action: "followup_generation_started",
    resourceType: "followup",
    resourceId: leadId,
    metadata: { leadId, classification: score.classification },
  });

  const strategy = getStrategy(score.classification);

  // Needs review classification → no outreach drafts, just a manual review recommendation
  if (strategy.manualReviewOnly) {
    const [rec] = await db.insert(schema.followupRecommendations).values({
      tenantId,
      eventId: lead.eventId ?? null,
      leadId,
      leadScoreId: score.id,
      createdByUserId: userId ?? null,
      followupType: "email",
      priority: "low",
      recommendedTiming: strategy.timing,
      subjectLine: null,
      messageContent: "This lead's score is classified as Needs Review. Manual review is recommended before any outreach is drafted — the data may be incomplete or low-confidence.",
      callToAction: "Review lead, conversation intelligence, and enrichment data manually.",
      reasoning: "Lead score classification is needs_review — automated outreach generation is paused until a human reviews the underlying data.",
      personalizationPoints: [],
      confidenceScore: String(score.recommendedNextAction ? 50 : 30),
      needsHumanReview: true,
      status: "draft",
      modelUsed: "none",
      rawAiResponse: null,
    }).returning();

    await logAudit({
      tenantId, userId,
      action: "followup_generated",
      resourceType: "followup",
      resourceId: rec.id,
      metadata: { leadId, type: "manual_review_recommendation" },
    });

    return [rec];
  }

  // Generate one draft per recommended type
  const records = [];
  for (const followupType of strategy.types) {
    let aiDraft: AiDraft;
    let modelUsed = "none";
    let rawResponse: unknown = null;

    try {
      ({ draft: aiDraft, modelUsed, rawResponse } = await getAiDraft(context, followupType, strategy));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "AI draft generation failed";
      aiDraft = {
        followupType,
        priority: strategy.priority,
        recommendedTiming: strategy.timing,
        subjectLine: "",
        messageContent: `AI draft generation failed: ${reason}. Please write this follow-up manually.`,
        callToAction: "Manual follow-up required.",
        reasoning: "AI generation failed — review and draft manually.",
        personalizationPoints: [],
        confidenceScore: 30,
        needsHumanReview: true,
      };
    }

    const [rec] = await db.insert(schema.followupRecommendations).values({
      tenantId,
      eventId: lead.eventId ?? null,
      leadId,
      leadScoreId: score.id,
      createdByUserId: userId ?? null,
      followupType: aiDraft.followupType,
      priority: aiDraft.priority,
      recommendedTiming: aiDraft.recommendedTiming,
      subjectLine: aiDraft.subjectLine || null,
      messageContent: aiDraft.messageContent,
      callToAction: aiDraft.callToAction,
      reasoning: aiDraft.reasoning,
      personalizationPoints: aiDraft.personalizationPoints,
      confidenceScore: String(aiDraft.confidenceScore),
      needsHumanReview: aiDraft.needsHumanReview,
      status: "draft",
      modelUsed,
      rawAiResponse: rawResponse as Record<string, unknown> | null,
    }).returning();

    records.push(rec);

    await logAudit({
      tenantId, userId,
      action: "followup_generated",
      resourceType: "followup",
      resourceId: rec.id,
      metadata: { leadId, followupType, confidence: aiDraft.confidenceScore },
    });
  }

  return records;
}

// ─── AI draft generation ────────────────────────────────────────────────────

const AI_FOLLOWUP_SYSTEM_PROMPT = `You are a RevOps consultant writing follow-up outreach for a logistics/supply-chain sales team after a trade show conversation. Your tone is professional, consultative, and revenue-focused — never generic or salesy.

Avoid phrases like "Just checking in" or "Hope this finds you well." Prefer specific callbacks: "Based on our discussion regarding warehouse visibility challenges..."

You must return ONLY valid JSON matching this schema — no markdown, no explanation:

{
  "followup_type": "email | linkedin | meeting_request | phone_call",
  "priority": "high | medium | low",
  "recommended_timing": "immediate | 24_hours | 3_days | 1_week | 2_weeks",
  "subject_line": "subject line (empty string if not applicable, e.g. phone_call)",
  "message_content": "the full draft message",
  "call_to_action": "the single specific ask at the end of the message",
  "reasoning": "1-2 sentences on why this approach and timing make sense for this lead",
  "personalization_points": ["specific fact 1 used", "specific fact 2 used"],
  "confidence_score": 0-100,
  "needs_human_review": true|false
}

Rules:
- Personalize using company name, job title, pain points, timeline, and product interest — only facts provided, never invent details
- confidence_score below 70 means needs_human_review must be true
- Message content must NOT claim any action has been taken — these are drafts pending human approval
- Do not mention sending, scheduling, or syncing — you are only producing the draft text
- For linkedin: keep message under 300 characters, conversational
- For meeting_request: include a specific proposed meeting purpose, not just "let's connect"
- For phone_call: message_content should be a call talking-points script, not an email`;

async function getAiDraft(
  context: FollowupContext,
  followupType: FollowupType,
  strategy: StrategyPlan
): Promise<{ draft: AiDraft; modelUsed: string; rawResponse: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = buildFollowupPrompt(context, followupType, strategy);

  const response = await model.generateContent([
    { text: AI_FOLLOWUP_SYSTEM_PROMPT },
    { text: prompt },
  ]);

  const rawText = response.response.text();
  let parsed: unknown;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned invalid JSON: ${rawText.slice(0, 200)}`);
  }

  const draft = validateAiDraft(parsed, followupType, strategy);
  return { draft, modelUsed: `gemini/${modelName}`, rawResponse: parsed };
}

function buildFollowupPrompt(context: FollowupContext, followupType: FollowupType, strategy: StrategyPlan): string {
  const painPoints = toArray(context.insight?.painPoints).join(", ") || "none captured";
  const productInterest = toArray(context.insight?.productInterest).join(", ") || "none captured";

  return `Generate a ${followupType} follow-up draft.

Lead: ${context.lead.firstName} ${context.lead.lastName ?? ""}
Job Title: ${context.lead.jobTitle ?? "unknown"}
Company: ${context.lead.companyName}
Industry: ${context.company?.industry ?? "unknown"}
Company Size: ${context.company?.employeeRange ?? "unknown"}
HQ: ${context.company?.headquarters ?? "unknown"}

Conversation Summary: ${context.insight?.summary ?? "No conversation captured yet."}
Pain Points: ${painPoints}
Product Interest: ${productInterest}
Business Need: ${context.insight?.businessNeed ?? "unknown"}
Timeline: ${context.insight?.timeline ?? "unknown"}
Urgency: ${context.insight?.urgency ?? "unknown"}

Lead Score: ${context.score?.score ?? "N/A"}/100 (${context.score?.classification ?? "unknown"})
Recommended Next Action (from scoring): ${context.score?.recommendedNextAction ?? "none"}

Required follow-up type: ${followupType}
Required priority: ${strategy.priority}
Required timing: ${strategy.timing}

Write the draft now, returning the JSON object.`;
}

function validateAiDraft(raw: unknown, expectedType: FollowupType, strategy: StrategyPlan): AiDraft {
  if (typeof raw !== "object" || raw === null) throw new Error("AI response is not an object");
  const r = raw as Record<string, unknown>;

  const VALID_TYPES: FollowupType[] = ["email", "linkedin", "meeting_request", "phone_call"];
  const VALID_PRIORITIES: FollowupPriority[] = ["high", "medium", "low"];
  const VALID_TIMINGS: FollowupTiming[] = ["immediate", "24_hours", "3_days", "1_week", "2_weeks"];

  const followupType = VALID_TYPES.includes(r.followup_type as FollowupType) ? (r.followup_type as FollowupType) : expectedType;
  const priority = VALID_PRIORITIES.includes(r.priority as FollowupPriority) ? (r.priority as FollowupPriority) : strategy.priority;
  const recommendedTiming = VALID_TIMINGS.includes(r.recommended_timing as FollowupTiming) ? (r.recommended_timing as FollowupTiming) : strategy.timing;

  const confidence = Math.min(100, Math.max(0, Number(r.confidence_score ?? 0)));
  const messageContent = typeof r.message_content === "string" ? r.message_content : "";

  if (!messageContent) throw new Error("AI response missing message_content");

  return {
    followupType,
    priority,
    recommendedTiming,
    subjectLine: typeof r.subject_line === "string" ? r.subject_line : "",
    messageContent,
    callToAction: typeof r.call_to_action === "string" ? r.call_to_action : "",
    reasoning: typeof r.reasoning === "string" ? r.reasoning : "",
    personalizationPoints: Array.isArray(r.personalization_points) ? r.personalization_points.map(String) : [],
    confidenceScore: confidence,
    needsHumanReview: confidence < 70 ? true : Boolean(r.needs_human_review),
  };
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}
