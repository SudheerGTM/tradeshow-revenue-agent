/**
 * Conversation Intelligence Agent — callable wrapper.
 *
 * Mirrors the persistence logic in /api/conversation-insights/analyze so
 * the orchestrator (and any future caller) can run this step
 * programmatically without an HTTP round-trip. The API route is unchanged
 * and remains the manual-trigger entry point from the UI.
 */

import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { analyzeConversation } from "@/lib/ai/provider";
import { logAudit } from "@/lib/audit";

export async function runConversationIntelligenceFromNotes(leadId: string, tenantId: string, userId: string | null) {
  const leadRows = await db.select().from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId))).limit(1);
  if (!leadRows.length) throw new Error("Lead not found");
  const lead = leadRows[0];

  const inputText = (lead.notes ?? "").trim();
  if (!inputText) {
    throw new Error("No lead notes available to analyze");
  }

  let eventName: string | undefined;
  if (lead.eventId) {
    const evRows = await db.select({ name: schema.events.name }).from(schema.events).where(eq(schema.events.id, lead.eventId)).limit(1);
    eventName = evRows[0]?.name;
  }

  await logAudit({
    tenantId, userId,
    action: "conversation_analysis_started",
    resourceType: "conversation_insight",
    resourceId: leadId,
    metadata: { inputSource: "lead_notes", leadId, triggeredBy: "orchestrator" },
  });

  const { result: aiResult, modelUsed, rawResponse } = await analyzeConversation(inputText, {
    leadName: `${lead.firstName} ${lead.lastName ?? ""}`.trim(),
    companyName: lead.companyName,
    eventName,
    jobTitle: lead.jobTitle ?? undefined,
  });

  const confidence = aiResult.confidence_score;
  const status = confidence < 70 ? "needs_review" : "completed";

  const [insight] = await db.insert(schema.conversationInsights).values({
    tenantId,
    eventId: lead.eventId ?? null,
    leadId,
    createdByUserId: userId,
    inputSource: "lead_notes",
    inputText,
    painPoints: aiResult.pain_points,
    productInterest: aiResult.product_interest,
    businessNeed: aiResult.business_need,
    urgency: aiResult.urgency,
    timeline: aiResult.timeline,
    budgetSignal: aiResult.budget_signal,
    decisionMakerSignal: aiResult.decision_maker_signal,
    competitorMentioned: aiResult.competitor_mentioned,
    nextBestAction: aiResult.next_best_action,
    summary: aiResult.summary,
    recommendedFollowUp: aiResult.recommended_follow_up,
    confidenceScore: String(confidence),
    aiModelUsed: modelUsed,
    aiRawResponse: rawResponse as Record<string, unknown>,
    status,
  }).returning();

  await logAudit({
    tenantId, userId,
    action: status === "needs_review" ? "conversation_analysis_needs_review" : "conversation_analysis_completed",
    resourceType: "conversation_insight",
    resourceId: insight.id,
    metadata: { confidence, status, triggeredBy: "orchestrator" },
  });

  return insight;
}
