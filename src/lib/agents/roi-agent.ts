/**
 * ROI Intelligence Agent — Release 12
 *
 * All financial metrics are calculated deterministically in
 * calculateEventROI(). The AI layer (generateExecutiveSummary) only
 * summarizes those already-computed numbers in plain language — it never
 * invents or modifies a revenue figure, cost, or opportunity.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

export interface EventROIResult {
  totalEventCost: number;
  totalLeads: number;
  qualifiedLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  needsReviewLeads: number;
  opportunitiesCreated: number;
  pipelineGenerated: number;
  expectedRevenue: number;
  wonRevenue: number;
  lostRevenue: number;
  roiPercentage: number | null;
  costPerLead: number | null;
  costPerQualifiedLead: number | null;
  costPerOpportunity: number | null;
  pipelineByStage: { stage: string; count: number; amount: number }[];
  pipelineByPriority: { priority: string; count: number; amount: number }[];
  expectedRevenueByStage: { stage: string; expectedRevenue: number }[];
  voiceNotesCount: number;
  conversationAnalysesCount: number;
  followUpsGeneratedCount: number;
  crmSyncCompletedCount: number;
  topOpportunities: { id: string; opportunityName: string; expectedRevenue: number | null; amount: number | null }[];
}

// ─── Deterministic calculation ─────────────────────────────────────────────

export async function calculateEventROI(eventId: string, tenantId: string): Promise<EventROIResult> {
  // Total cost
  const [costRow] = await db
    .select({ sum: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.eventCosts)
    .where(and(eq(schema.eventCosts.eventId, eventId), eq(schema.eventCosts.tenantId, tenantId)));
  const totalEventCost = parseFloat(costRow?.sum ?? "0");

  // Lead counts
  const [leadCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(and(eq(schema.leads.eventId, eventId), eq(schema.leads.tenantId, tenantId)));
  const totalLeads = leadCountRow?.count ?? 0;

  // Latest score per lead, scoped to this event's leads
  const latestScoreSq = db
    .selectDistinctOn([schema.leadScores.leadId], {
      leadId: schema.leadScores.leadId,
      classification: schema.leadScores.classification,
    })
    .from(schema.leadScores)
    .innerJoin(schema.leads, eq(schema.leadScores.leadId, schema.leads.id))
    .where(and(eq(schema.leadScores.tenantId, tenantId), eq(schema.leads.eventId, eventId)))
    .orderBy(schema.leadScores.leadId, sql`${schema.leadScores.createdAt} desc`)
    .as("latest_score_for_event");

  const classificationRows = await db
    .select({ classification: latestScoreSq.classification, count: sql<number>`count(*)::int` })
    .from(latestScoreSq)
    .groupBy(latestScoreSq.classification);

  let hotLeads = 0, warmLeads = 0, coldLeads = 0, needsReviewLeads = 0;
  for (const r of classificationRows) {
    if (r.classification === "hot") hotLeads = r.count;
    else if (r.classification === "warm") warmLeads = r.count;
    else if (r.classification === "cold") coldLeads = r.count;
    else if (r.classification === "needs_review") needsReviewLeads = r.count;
  }
  const qualifiedLeads = hotLeads + warmLeads;

  // Opportunities for this event
  const [oppCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId)));
  const opportunitiesCreated = oppCountRow?.count ?? 0;

  const [pipelineRow] = await db
    .select({ sum: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")));
  const pipelineGenerated = parseFloat(pipelineRow?.sum ?? "0");

  const [expectedRevRow] = await db
    .select({ sum: sql<string>`coalesce(sum(expected_revenue), 0)` })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")));
  const expectedRevenue = parseFloat(expectedRevRow?.sum ?? "0");

  const [wonRow] = await db
    .select({ sum: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "won")));
  const wonRevenue = parseFloat(wonRow?.sum ?? "0");

  const [lostRow] = await db
    .select({ sum: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "lost")));
  const lostRevenue = parseFloat(lostRow?.sum ?? "0");

  // ROI % = ((Won Revenue - Event Cost) / Event Cost) * 100
  const roiPercentage = totalEventCost > 0 ? Math.round(((wonRevenue - totalEventCost) / totalEventCost) * 10000) / 100 : null;
  const costPerLead = totalLeads > 0 ? Math.round((totalEventCost / totalLeads) * 100) / 100 : null;
  const costPerQualifiedLead = qualifiedLeads > 0 ? Math.round((totalEventCost / qualifiedLeads) * 100) / 100 : null;
  const costPerOpportunity = opportunitiesCreated > 0 ? Math.round((totalEventCost / opportunitiesCreated) * 100) / 100 : null;

  // Pipeline by stage / priority (active opportunities only)
  const stageRows = await db
    .select({ stage: schema.opportunities.stage, count: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(amount), 0)`, expRev: sql<string>`coalesce(sum(expected_revenue), 0)` })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")))
    .groupBy(schema.opportunities.stage);

  const pipelineByStage = stageRows.map(r => ({ stage: r.stage, count: r.count, amount: parseFloat(r.amount) }));
  const expectedRevenueByStage = stageRows.map(r => ({ stage: r.stage, expectedRevenue: parseFloat(r.expRev) }));

  const priorityRows = await db
    .select({ priority: schema.opportunities.priority, count: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")))
    .groupBy(schema.opportunities.priority);
  const pipelineByPriority = priorityRows.map(r => ({ priority: r.priority, count: r.count, amount: parseFloat(r.amount) }));

  // Activity metrics
  const [voiceRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.voiceNotes)
    .where(and(eq(schema.voiceNotes.eventId, eventId), eq(schema.voiceNotes.tenantId, tenantId), eq(schema.voiceNotes.recordingStatus, "uploaded")));
  const voiceNotesCount = voiceRow?.count ?? 0;

  const [ciRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.conversationInsights)
    .where(and(eq(schema.conversationInsights.eventId, eventId), eq(schema.conversationInsights.tenantId, tenantId)));
  const conversationAnalysesCount = ciRow?.count ?? 0;

  const [followupRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.followupRecommendations)
    .where(and(eq(schema.followupRecommendations.eventId, eventId), eq(schema.followupRecommendations.tenantId, tenantId)));
  const followUpsGeneratedCount = followupRow?.count ?? 0;

  const [crmRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.crmSyncJobs)
    .where(and(eq(schema.crmSyncJobs.eventId, eventId), eq(schema.crmSyncJobs.tenantId, tenantId), eq(schema.crmSyncJobs.syncStatus, "completed")));
  const crmSyncCompletedCount = crmRow?.count ?? 0;

  // Top opportunities
  const topOpportunities = await db
    .select({ id: schema.opportunities.id, opportunityName: schema.opportunities.opportunityName, expectedRevenue: schema.opportunities.expectedRevenue, amount: schema.opportunities.amount })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")))
    .orderBy(sql`${schema.opportunities.expectedRevenue} desc`)
    .limit(5);

  return {
    totalEventCost, totalLeads, qualifiedLeads, hotLeads, warmLeads, coldLeads, needsReviewLeads,
    opportunitiesCreated, pipelineGenerated, expectedRevenue, wonRevenue, lostRevenue,
    roiPercentage, costPerLead, costPerQualifiedLead, costPerOpportunity,
    pipelineByStage, pipelineByPriority, expectedRevenueByStage,
    voiceNotesCount, conversationAnalysesCount, followUpsGeneratedCount, crmSyncCompletedCount,
    topOpportunities: topOpportunities.map(o => ({
      id: o.id, opportunityName: o.opportunityName,
      expectedRevenue: o.expectedRevenue != null ? parseFloat(o.expectedRevenue) : null,
      amount: o.amount != null ? parseFloat(o.amount) : null,
    })),
  };
}

// ─── Persist + audit ────────────────────────────────────────────────────────

export async function recalculateAndStoreROI(eventId: string, tenantId: string, userId?: string | null) {
  const result = await calculateEventROI(eventId, tenantId);

  const [existing] = await db.select({ id: schema.eventRoiMetrics.id })
    .from(schema.eventRoiMetrics)
    .where(and(eq(schema.eventRoiMetrics.eventId, eventId), eq(schema.eventRoiMetrics.tenantId, tenantId)))
    .limit(1);

  const values = {
    totalEventCost: String(result.totalEventCost),
    totalLeads: result.totalLeads,
    qualifiedLeads: result.qualifiedLeads,
    hotLeads: result.hotLeads,
    opportunitiesCreated: result.opportunitiesCreated,
    pipelineGenerated: String(result.pipelineGenerated),
    expectedRevenue: String(result.expectedRevenue),
    wonRevenue: String(result.wonRevenue),
    lostRevenue: String(result.lostRevenue),
    roiPercentage: result.roiPercentage != null ? String(result.roiPercentage) : null,
    costPerLead: result.costPerLead != null ? String(result.costPerLead) : null,
    costPerQualifiedLead: result.costPerQualifiedLead != null ? String(result.costPerQualifiedLead) : null,
    costPerOpportunity: result.costPerOpportunity != null ? String(result.costPerOpportunity) : null,
    updatedAt: new Date(),
  };

  let record;
  if (existing) {
    [record] = await db.update(schema.eventRoiMetrics).set(values).where(eq(schema.eventRoiMetrics.id, existing.id)).returning();
  } else {
    [record] = await db.insert(schema.eventRoiMetrics).values({ tenantId, eventId, ...values }).returning();
  }

  await logAudit({
    tenantId, userId,
    action: "roi_calculated",
    resourceType: "event_roi",
    resourceId: eventId,
    metadata: { roiPercentage: result.roiPercentage, totalEventCost: result.totalEventCost, wonRevenue: result.wonRevenue },
  });

  return { record, result };
}

// ─── AI executive summary (summarizes only — never computes numbers) ──────

export async function generateExecutiveSummary(
  eventId: string,
  tenantId: string,
  eventName: string,
  metrics: EventROIResult,
  userId?: string | null
): Promise<{ summary: string; confidenceScore: number; modelUsed: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  let summary: string;
  let confidenceScore: number;
  let modelUsed: string;

  if (!apiKey) {
    summary = fallbackSummary(eventName, metrics);
    confidenceScore = 60;
    modelUsed = "deterministic-fallback";
  } else {
    try {
      const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });

      const prompt = `You are a RevOps consultant writing an executive summary for a trade show ROI report. You will be given already-calculated metrics — do NOT recalculate, invent, or change any number. Only summarize what is given, in plain consultative language, similar to:

"The event generated 124 leads, resulting in 18 qualified opportunities and an estimated pipeline value of £420,000. Based on current opportunity progression, the expected revenue is £96,000 against an event investment of £14,000."

Event: ${eventName}
Event Cost: £${metrics.totalEventCost.toLocaleString("en-GB")}
Total Leads: ${metrics.totalLeads}
Qualified Leads (Hot+Warm): ${metrics.qualifiedLeads}
Hot Leads: ${metrics.hotLeads}
Opportunities Created: ${metrics.opportunitiesCreated}
Pipeline Generated: £${metrics.pipelineGenerated.toLocaleString("en-GB")}
Expected Revenue: £${metrics.expectedRevenue.toLocaleString("en-GB")}
Won Revenue: £${metrics.wonRevenue.toLocaleString("en-GB")}
ROI %: ${metrics.roiPercentage != null ? `${metrics.roiPercentage}%` : "not calculable (no cost recorded)"}
Cost Per Lead: ${metrics.costPerLead != null ? `£${metrics.costPerLead}` : "n/a"}

Return ONLY this JSON, no markdown:
{ "executive_summary": "2-4 sentence summary using only the numbers above", "confidence_score": 0-100 }

confidence_score should reflect data completeness (e.g. lower if cost or pipeline data is missing/zero).`;

      const response = await model.generateContent([{ text: prompt }]);
      const rawText = response.response.text();
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      summary = typeof parsed.executive_summary === "string" && parsed.executive_summary ? parsed.executive_summary : fallbackSummary(eventName, metrics);
      confidenceScore = Math.min(100, Math.max(0, Number(parsed.confidence_score ?? 60)));
      modelUsed = `gemini/${modelName}`;
    } catch {
      summary = fallbackSummary(eventName, metrics);
      confidenceScore = 50;
      modelUsed = "deterministic-fallback";
    }
  }

  await db.update(schema.eventRoiMetrics).set({
    executiveSummary: summary,
    summaryGeneratedAt: new Date(),
    summaryConfidenceScore: String(confidenceScore),
    summaryModelUsed: modelUsed,
    updatedAt: new Date(),
  }).where(and(eq(schema.eventRoiMetrics.eventId, eventId), eq(schema.eventRoiMetrics.tenantId, tenantId)));

  await logAudit({
    tenantId, userId,
    action: "executive_summary_generated",
    resourceType: "event_roi",
    resourceId: eventId,
    metadata: { confidenceScore, modelUsed },
  });

  return { summary, confidenceScore, modelUsed };
}

function fallbackSummary(eventName: string, m: EventROIResult): string {
  const roiText = m.roiPercentage != null ? `a ${m.roiPercentage}% ROI` : "an ROI that cannot yet be calculated without event cost data";
  return `${eventName} generated ${m.totalLeads} leads, resulting in ${m.opportunitiesCreated} opportunities and an estimated pipeline value of £${m.pipelineGenerated.toLocaleString("en-GB")}. Expected revenue stands at £${m.expectedRevenue.toLocaleString("en-GB")} against an event investment of £${m.totalEventCost.toLocaleString("en-GB")}, representing ${roiText}.`;
}
