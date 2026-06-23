/**
 * Lead Scoring Agent — Release 8
 *
 * Deterministic scoring (backend) + AI explanation (Gemini).
 * AI never determines the numeric score — it only explains, identifies risks,
 * and recommends a next action.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import type { ScoreClassification } from "@/db/schema";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ScoringInputs {
  lead: {
    id: string;
    tenantId: string;
    eventId: string | null;
    firstName: string;
    lastName: string | null;
    jobTitle: string | null;
    companyName: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    consentGiven: boolean;
    status: string;
    createdByUserId: string | null;
  };
  insight: {
    painPoints: unknown;
    productInterest: unknown;
    businessNeed: string | null;
    urgency: string;
    timeline: string | null;
    budgetSignal: string | null;
    decisionMakerSignal: string | null;
    competitorMentioned: string | null;
    confidenceScore: string | null;
  } | null;
  company: {
    industry: string | null;
    employeeCount: string | null;
    employeeRange: string | null;
    annualRevenue: string | null;
    revenueRange: string | null;
    headquarters: string | null;
    companyDescription: string | null;
    enrichmentStatus: string;
  } | null;
  contact: {
    seniority: string | null;
    department: string | null;
    jobFunction: string | null;
    enrichmentStatus: string;
  } | null;
}

interface ScoreBreakdown {
  companyFitScore: number;
  authorityScore: number;
  needScore: number;
  urgencyScore: number;
  engagementScore: number;
  dataQualityScore: number;
  total: number;
  classification: ScoreClassification;
}

interface OpportunityEstimate {
  estimatedOpportunityValue: number;
  estimatedCloseProbability: number;
  expectedRevenue: number;
}

interface AiExplanation {
  scoreExplanation: string;
  scoreDrivers: string[];
  risks: string[];
  recommendedNextAction: string;
  confidenceScore: number;
  needsHumanReview: boolean;
}

// ─── Public entry point ────────────────────────────────────────────────────

export async function scoreLead(leadId: string, tenantId: string, userId: string | null) {
  // 1. Load lead
  const leadRows = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId)))
    .limit(1);
  if (!leadRows.length) throw new Error("Lead not found");
  const lead = leadRows[0];

  // 2. Load latest CI insight
  const insightRows = await db
    .select()
    .from(schema.conversationInsights)
    .where(and(
      eq(schema.conversationInsights.leadId, leadId),
      eq(schema.conversationInsights.tenantId, tenantId),
    ))
    .orderBy(desc(schema.conversationInsights.createdAt))
    .limit(1);
  const insight = insightRows[0] ?? null;

  // 3. Load latest company enrichment
  const companyRows = await db
    .select()
    .from(schema.companyEnrichment)
    .where(and(
      eq(schema.companyEnrichment.leadId, leadId),
      eq(schema.companyEnrichment.tenantId, tenantId),
    ))
    .orderBy(desc(schema.companyEnrichment.updatedAt))
    .limit(1);
  const company = companyRows[0] ?? null;

  // 4. Load latest contact enrichment
  const contactRows = await db
    .select()
    .from(schema.contactEnrichment)
    .where(and(
      eq(schema.contactEnrichment.leadId, leadId),
      eq(schema.contactEnrichment.tenantId, tenantId),
    ))
    .orderBy(desc(schema.contactEnrichment.updatedAt))
    .limit(1);
  const contact = contactRows[0] ?? null;

  const inputs: ScoringInputs = {
    lead: {
      id: lead.id,
      tenantId: lead.tenantId,
      eventId: lead.eventId ?? null,
      firstName: lead.firstName,
      lastName: lead.lastName ?? null,
      jobTitle: lead.jobTitle ?? null,
      companyName: lead.companyName,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      notes: lead.notes ?? null,
      consentGiven: lead.consentGiven,
      status: lead.status,
      createdByUserId: lead.createdByUserId ?? null,
    },
    insight: insight ? {
      painPoints: insight.painPoints,
      productInterest: insight.productInterest,
      businessNeed: insight.businessNeed,
      urgency: insight.urgency,
      timeline: insight.timeline,
      budgetSignal: insight.budgetSignal,
      decisionMakerSignal: insight.decisionMakerSignal,
      competitorMentioned: insight.competitorMentioned,
      confidenceScore: insight.confidenceScore,
    } : null,
    company: company ? {
      industry: company.industry,
      employeeCount: company.employeeCount,
      employeeRange: company.employeeRange,
      annualRevenue: company.annualRevenue,
      revenueRange: company.revenueRange,
      headquarters: company.headquarters,
      companyDescription: company.companyDescription,
      enrichmentStatus: company.enrichmentStatus,
    } : null,
    contact: contact ? {
      seniority: contact.seniority,
      department: contact.department,
      jobFunction: contact.jobFunction,
      enrichmentStatus: contact.enrichmentStatus,
    } : null,
  };

  await logAudit({
    tenantId, userId,
    action: "lead_score_generation_started",
    resourceType: "lead_score",
    resourceId: leadId,
    metadata: { leadId, hasInsight: !!insight, hasCompany: !!company, hasContact: !!contact },
  });

  // 5. Deterministic score
  const breakdown = calculateLeadScore(inputs);

  // 6. Opportunity estimate
  const opportunity = estimateOpportunity(breakdown.classification, inputs.company);

  // 7. AI explanation
  let aiResult: AiExplanation;
  let modelUsed = "none";
  let rawAiResponse: unknown = null;
  let status: "completed" | "failed" | "needs_review" = "completed";
  let failureReason: string | null = null;

  try {
    ({ explanation: aiResult, modelUsed, rawResponse: rawAiResponse } = await getAiExplanation(inputs, breakdown));
    if (aiResult.confidenceScore < 70 || aiResult.needsHumanReview) {
      status = "needs_review";
    }
  } catch (err) {
    // AI failure doesn't block scoring — we have the deterministic score
    failureReason = err instanceof Error ? err.message : "AI explanation failed";
    status = "needs_review";
    aiResult = {
      scoreExplanation: "AI explanation unavailable. Score calculated from available data.",
      scoreDrivers: [],
      risks: ["AI explanation could not be generated — please review manually."],
      recommendedNextAction: "Review lead data and follow up based on score and classification.",
      confidenceScore: 50,
      needsHumanReview: true,
    };
  }

  const needsHumanReview = aiResult.needsHumanReview || breakdown.classification === "needs_review";
  if (needsHumanReview) status = "needs_review";

  // 8. Persist
  const [scoreRecord] = await db.insert(schema.leadScores).values({
    tenantId,
    eventId: lead.eventId ?? null,
    leadId,
    createdByUserId: userId ?? null,
    score: String(breakdown.total),
    classification: breakdown.classification,
    companyFitScore:  String(breakdown.companyFitScore),
    authorityScore:   String(breakdown.authorityScore),
    needScore:        String(breakdown.needScore),
    urgencyScore:     String(breakdown.urgencyScore),
    engagementScore:  String(breakdown.engagementScore),
    dataQualityScore: String(breakdown.dataQualityScore),
    estimatedOpportunityValue: String(opportunity.estimatedOpportunityValue),
    estimatedCloseProbability:  String(opportunity.estimatedCloseProbability),
    expectedRevenue:            String(opportunity.expectedRevenue),
    scoreExplanation:     aiResult.scoreExplanation,
    scoreDrivers:         aiResult.scoreDrivers,
    risks:                aiResult.risks,
    recommendedNextAction: aiResult.recommendedNextAction,
    confidenceScore:   String(aiResult.confidenceScore),
    needsHumanReview,
    modelUsed,
    rawAiResponse: rawAiResponse as Record<string, unknown> | null,
    status,
    failureReason,
  }).returning();

  const auditAction = status === "needs_review"
    ? "lead_score_needs_review"
    : "lead_score_generated";

  await logAudit({
    tenantId, userId,
    action: auditAction,
    resourceType: "lead_score",
    resourceId: scoreRecord.id,
    metadata: {
      leadId,
      score: breakdown.total,
      classification: breakdown.classification,
      confidenceScore: aiResult.confidenceScore,
    },
  });

  return scoreRecord;
}

// ─── Deterministic scoring ─────────────────────────────────────────────────

export function calculateLeadScore(inputs: ScoringInputs): ScoreBreakdown {
  // Company Fit — 25 pts
  let companyFitScore = 0;
  if (inputs.company?.enrichmentStatus === "enriched" || inputs.company?.enrichmentStatus === "partially_enriched") {
    const empCount = parseEmployeeCount(inputs.company.employeeCount, inputs.company.employeeRange);
    if (empCount >= 1000) companyFitScore = 25;
    else if (empCount >= 200) companyFitScore = 18;
    else if (empCount >= 50) companyFitScore = 12;
    else companyFitScore = 8;

    // Logistics industry bonus
    const industry = (inputs.company.industry ?? "").toLowerCase();
    if (industry.includes("logistics") || industry.includes("transport") || industry.includes("supply chain") || industry.includes("freight")) {
      companyFitScore = Math.min(25, companyFitScore + 5);
    }
  } else if (inputs.lead.companyName) {
    companyFitScore = 5; // partial credit for having a company name
  }

  // Authority — 20 pts
  let authorityScore = 0;
  const seniority = (inputs.contact?.seniority ?? "").toLowerCase();
  const jobTitle = (inputs.lead.jobTitle ?? "").toLowerCase();
  const decisionSignal = (inputs.insight?.decisionMakerSignal ?? "").toLowerCase();

  if (seniority.includes("c_suite") || seniority.includes("owner") || seniority.includes("vp") || seniority.includes("director") ||
      jobTitle.includes("ceo") || jobTitle.includes("cto") || jobTitle.includes("coo") || jobTitle.includes("director") || jobTitle.includes("vp") || jobTitle.includes("head of")) {
    authorityScore = 20;
  } else if (seniority.includes("manager") || jobTitle.includes("manager") || jobTitle.includes("lead")) {
    authorityScore = 14;
  } else if (seniority.includes("senior") || seniority.includes("sr")) {
    authorityScore = 10;
  } else if (inputs.contact?.enrichmentStatus === "enriched") {
    authorityScore = 6;
  } else {
    authorityScore = 3;
  }

  if (decisionSignal.includes("decision") || decisionSignal.includes("authority") || decisionSignal.includes("budget")) {
    authorityScore = Math.min(20, authorityScore + 4);
  }

  // Need / Pain — 20 pts
  let needScore = 0;
  const painPoints = toArray(inputs.insight?.painPoints);
  const productInterest = toArray(inputs.insight?.productInterest);
  const businessNeed = inputs.insight?.businessNeed ?? "";

  if (painPoints.length >= 3) needScore += 10;
  else if (painPoints.length >= 1) needScore += 6;
  if (productInterest.length >= 2) needScore += 6;
  else if (productInterest.length >= 1) needScore += 3;
  if (businessNeed.length > 10) needScore += 4;
  needScore = Math.min(20, needScore);

  // Urgency / Timeline — 15 pts
  let urgencyScore = 0;
  const urgency = inputs.insight?.urgency ?? "unknown";
  const timeline = (inputs.insight?.timeline ?? "").toLowerCase();
  if (urgency === "high") urgencyScore = 15;
  else if (urgency === "medium") urgencyScore = 9;
  else if (urgency === "low") urgencyScore = 4;
  // Timeline bonus
  if (timeline.includes("q1") || timeline.includes("q2") || timeline.includes("month") || timeline.includes("week") || timeline.includes("immediate") || timeline.includes("asap")) {
    urgencyScore = Math.min(15, urgencyScore + 4);
  }
  if (inputs.insight?.budgetSignal && inputs.insight.budgetSignal.length > 5) {
    urgencyScore = Math.min(15, urgencyScore + 2);
  }

  // Engagement Quality — 10 pts
  let engagementScore = 0;
  if (inputs.lead.notes && inputs.lead.notes.length > 50) engagementScore += 3;
  if (inputs.insight) engagementScore += 4;
  if (inputs.lead.consentGiven) engagementScore += 2;
  if (inputs.lead.email) engagementScore += 1;
  engagementScore = Math.min(10, engagementScore);

  // Data Quality — 10 pts
  let dataQualityScore = 0;
  if (inputs.lead.email) dataQualityScore += 2;
  if (inputs.lead.phone) dataQualityScore += 1;
  if (inputs.company?.enrichmentStatus === "enriched") dataQualityScore += 3;
  else if (inputs.company?.enrichmentStatus === "partially_enriched") dataQualityScore += 1;
  if (inputs.contact?.enrichmentStatus === "enriched") dataQualityScore += 2;
  if (inputs.insight) dataQualityScore += 2;
  dataQualityScore = Math.min(10, dataQualityScore);

  const total = Math.round(
    companyFitScore + authorityScore + needScore + urgencyScore + engagementScore + dataQualityScore
  );

  // Classification
  const insightConfidence = parseFloat(inputs.insight?.confidenceScore ?? "100");
  let classification: ScoreClassification;
  if (insightConfidence < 70 || (!inputs.insight && !inputs.company && !inputs.contact)) {
    classification = "needs_review";
  } else if (total >= 80) {
    classification = "hot";
  } else if (total >= 55) {
    classification = "warm";
  } else {
    classification = "cold";
  }

  return { companyFitScore, authorityScore, needScore, urgencyScore, engagementScore, dataQualityScore, total, classification };
}

// ─── Opportunity estimate ──────────────────────────────────────────────────

function estimateOpportunity(classification: ScoreClassification, company: ScoringInputs["company"]): OpportunityEstimate {
  let estimatedOpportunityValue = 5000;
  let needsHumanReview = false;

  if (company?.enrichmentStatus === "enriched" || company?.enrichmentStatus === "partially_enriched") {
    const empCount = parseEmployeeCount(company.employeeCount, company.employeeRange);
    if (empCount >= 1000) estimatedOpportunityValue = 50000;
    else if (empCount >= 200) estimatedOpportunityValue = 20000;
    else estimatedOpportunityValue = 7500;
  } else if (company?.revenueRange || company?.annualRevenue) {
    const rev = (company.revenueRange ?? company.annualRevenue ?? "").toLowerCase();
    if (rev.includes("billion") || rev.includes("500m") || rev.includes("1b")) estimatedOpportunityValue = 50000;
    else if (rev.includes("100m") || rev.includes("50m")) estimatedOpportunityValue = 20000;
    else estimatedOpportunityValue = 7500;
  } else {
    estimatedOpportunityValue = 5000;
    needsHumanReview = true;
  }

  const probMap: Record<ScoreClassification, number> = {
    hot: 0.40, warm: 0.20, cold: 0.05, needs_review: 0.10,
  };
  const estimatedCloseProbability = probMap[classification];
  const expectedRevenue = Math.round(estimatedOpportunityValue * estimatedCloseProbability);

  void needsHumanReview; // factored into classification already
  return { estimatedOpportunityValue, estimatedCloseProbability, expectedRevenue };
}

// ─── AI explanation ────────────────────────────────────────────────────────

const AI_SCORE_SYSTEM_PROMPT = `You are a B2B sales qualification expert. You will receive a structured summary of a trade show lead and their deterministic lead score. Your job is to:

1. Explain the score in plain RevOps consultant language (2-3 sentences)
2. List the top score drivers (what's working in this lead's favour)
3. List the key risks or gaps
4. Recommend ONE specific next action the sales rep should take

You must return ONLY valid JSON matching this schema — no markdown, no explanation:

{
  "score_explanation": "2-3 sentence explanation of why this lead scored this way",
  "score_drivers": ["driver 1", "driver 2", "driver 3"],
  "risks": ["risk 1", "risk 2"],
  "recommended_next_action": "single specific action",
  "confidence_score": 0-100,
  "needs_human_review": true|false
}

Rules:
- confidence_score reflects how complete the data is (missing enrichment = lower confidence)
- needs_human_review must be true if confidence_score < 70
- Do NOT suggest sending emails, creating HubSpot records, or automated follow-ups
- Be specific and actionable — avoid generic advice`;

async function getAiExplanation(
  inputs: ScoringInputs,
  breakdown: ScoreBreakdown
): Promise<{ explanation: AiExplanation; modelUsed: string; rawResponse: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });

  const context = buildScoringContext(inputs, breakdown);

  const response = await model.generateContent([
    { text: AI_SCORE_SYSTEM_PROMPT },
    { text: context },
  ]);

  const rawText = response.response.text();
  let parsed: unknown;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned invalid JSON: ${rawText.slice(0, 200)}`);
  }

  const explanation = validateAiExplanation(parsed);
  return { explanation, modelUsed: `gemini/${modelName}`, rawResponse: parsed };
}

function buildScoringContext(inputs: ScoringInputs, breakdown: ScoreBreakdown): string {
  const painPoints = toArray(inputs.insight?.painPoints).join(", ") || "none captured";
  const productInterest = toArray(inputs.insight?.productInterest).join(", ") || "none captured";

  return `Lead Scoring Summary

Lead: ${inputs.lead.firstName} ${inputs.lead.lastName ?? ""}
Job Title: ${inputs.lead.jobTitle ?? "unknown"}
Company: ${inputs.lead.companyName}
Email: ${inputs.lead.email ? "provided" : "missing"}
Phone: ${inputs.lead.phone ? "provided" : "missing"}
Notes: ${inputs.lead.notes ? `"${inputs.lead.notes.slice(0, 200)}"` : "none"}
Consent: ${inputs.lead.consentGiven ? "yes" : "no"}

Company Intelligence:
- Industry: ${inputs.company?.industry ?? "unknown"}
- Employees: ${inputs.company?.employeeRange ?? inputs.company?.employeeCount ?? "unknown"}
- Revenue: ${inputs.company?.revenueRange ?? inputs.company?.annualRevenue ?? "unknown"}
- HQ: ${inputs.company?.headquarters ?? "unknown"}
- Enrichment: ${inputs.company?.enrichmentStatus ?? "not enriched"}

Contact Intelligence:
- Seniority: ${inputs.contact?.seniority ?? "unknown"}
- Department: ${inputs.contact?.department ?? "unknown"}
- Function: ${inputs.contact?.jobFunction ?? "unknown"}
- Enrichment: ${inputs.contact?.enrichmentStatus ?? "not enriched"}

Conversation Intelligence:
- Pain Points: ${painPoints}
- Product Interest: ${productInterest}
- Business Need: ${inputs.insight?.businessNeed ?? "unknown"}
- Urgency: ${inputs.insight?.urgency ?? "unknown"}
- Timeline: ${inputs.insight?.timeline ?? "unknown"}
- Budget Signal: ${inputs.insight?.budgetSignal ?? "none"}
- Decision Maker Signal: ${inputs.insight?.decisionMakerSignal ?? "none"}
- Competitor Mentioned: ${inputs.insight?.competitorMentioned ?? "none"}
- CI Confidence Score: ${inputs.insight?.confidenceScore ?? "N/A"}

Calculated Score: ${breakdown.total}/100
Classification: ${breakdown.classification.toUpperCase()}
- Company Fit: ${breakdown.companyFitScore}/25
- Authority: ${breakdown.authorityScore}/20
- Need/Pain: ${breakdown.needScore}/20
- Urgency/Timeline: ${breakdown.urgencyScore}/15
- Engagement: ${breakdown.engagementScore}/10
- Data Quality: ${breakdown.dataQualityScore}/10

Now explain this score and provide your analysis.`;
}

function validateAiExplanation(raw: unknown): AiExplanation {
  if (typeof raw !== "object" || raw === null) throw new Error("AI response is not an object");
  const r = raw as Record<string, unknown>;
  const confidence = Math.min(100, Math.max(0, Number(r.confidence_score ?? 0)));
  return {
    scoreExplanation: typeof r.score_explanation === "string" ? r.score_explanation : "Score calculated from available lead data.",
    scoreDrivers: Array.isArray(r.score_drivers) ? r.score_drivers.map(String) : [],
    risks: Array.isArray(r.risks) ? r.risks.map(String) : [],
    recommendedNextAction: typeof r.recommended_next_action === "string" ? r.recommended_next_action : "",
    confidenceScore: confidence,
    needsHumanReview: confidence < 70 ? true : Boolean(r.needs_human_review),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}

function parseEmployeeCount(countStr: string | null, rangeStr: string | null): number {
  // Try range string first: "1000-5000", "200+", "50-200"
  const range = rangeStr ?? countStr ?? "";
  const match = range.replace(/,/g, "").match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 0;
}
