import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { analyzeConversation } from "@/lib/ai/provider";
import type { InsightInputSource } from "@/db/schema";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json() as {
    leadId: string;
    inputSource: InsightInputSource;
    inputText?: string;
    transcriptId?: string;
    voiceNoteId?: string;
  };

  const { leadId, inputSource, transcriptId, voiceNoteId } = body;
  if (!leadId || !inputSource) {
    return NextResponse.json({ error: "leadId and inputSource required" }, { status: 400 });
  }

  // 1. Verify lead access (booth_user restricted to own leads)
  const role = session.user.role;
  const leadConditions = [
    eq(schema.leads.id, leadId),
    eq(schema.leads.tenantId, tenantId),
  ];
  if (role === "booth_user") {
    leadConditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }

  const leadRows = await db.select().from(schema.leads).where(and(...leadConditions)).limit(1);
  if (!leadRows.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const lead = leadRows[0];

  // 2. Resolve input text
  let inputText = "";

  if (inputSource === "manual_transcript") {
    inputText = (body.inputText ?? "").trim();
    if (!inputText) return NextResponse.json({ error: "inputText is required for manual_transcript" }, { status: 400 });
  } else if (inputSource === "transcript_table") {
    if (!transcriptId) return NextResponse.json({ error: "transcriptId required for transcript_table source" }, { status: 400 });
    const txRows = await db
      .select({ transcriptText: schema.transcripts.transcriptText })
      .from(schema.transcripts)
      .where(and(eq(schema.transcripts.id, transcriptId), eq(schema.transcripts.tenantId, tenantId)))
      .limit(1);
    if (!txRows.length || !txRows[0].transcriptText) {
      return NextResponse.json({ error: "Transcript not found or has no text yet" }, { status: 404 });
    }
    inputText = txRows[0].transcriptText;
  } else if (inputSource === "lead_notes") {
    inputText = (lead.notes ?? "").trim();
    if (!inputText) return NextResponse.json({ error: "This lead has no notes to analyze" }, { status: 400 });
  }

  if (!inputText) return NextResponse.json({ error: "No input text to analyze" }, { status: 400 });

  // 3. Fetch event name for context
  let eventName: string | undefined;
  if (lead.eventId) {
    const evRows = await db
      .select({ name: schema.events.name })
      .from(schema.events)
      .where(eq(schema.events.id, lead.eventId))
      .limit(1);
    eventName = evRows[0]?.name;
  }

  await logAudit({
    tenantId, userId: session.user.id,
    action: "conversation_analysis_started",
    resourceType: "conversation_insight",
    resourceId: leadId,
    metadata: { inputSource, leadId },
  });

  // 4. Run AI analysis
  let aiResult, modelUsed, rawResponse;
  try {
    ({ result: aiResult, modelUsed, rawResponse } = await analyzeConversation(inputText, {
      leadName: `${lead.firstName} ${lead.lastName ?? ""}`.trim(),
      companyName: lead.companyName,
      eventName,
      jobTitle: lead.jobTitle ?? undefined,
    }));
  } catch (err) {
    const reason = err instanceof Error ? err.message : "AI analysis failed";

    // Store failed record
    const [failedInsight] = await db.insert(schema.conversationInsights).values({
      tenantId, leadId,
      eventId: lead.eventId ?? null,
      voiceNoteId: voiceNoteId ?? null,
      transcriptId: transcriptId ?? null,
      createdByUserId: session.user.id ?? null,
      inputSource,
      inputText,
      urgency: "unknown",
      status: "failed",
      failureReason: reason,
    }).returning();

    await logAudit({
      tenantId, userId: session.user.id,
      action: "conversation_analysis_failed",
      resourceType: "conversation_insight",
      resourceId: failedInsight.id,
      metadata: { reason },
    });

    return NextResponse.json({ error: reason }, { status: 502 });
  }

  // 5. Determine status
  const confidence = aiResult.confidence_score;
  const status = confidence < 70 ? "needs_review" : "completed";

  // 6. Persist insight
  const [insight] = await db.insert(schema.conversationInsights).values({
    tenantId,
    eventId: lead.eventId ?? null,
    leadId,
    voiceNoteId: voiceNoteId ?? null,
    transcriptId: transcriptId ?? null,
    createdByUserId: session.user.id ?? null,
    inputSource,
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

  const auditAction = status === "needs_review"
    ? "conversation_analysis_needs_review"
    : "conversation_analysis_completed";

  await logAudit({
    tenantId, userId: session.user.id,
    action: auditAction,
    resourceType: "conversation_insight",
    resourceId: insight.id,
    metadata: { confidence, status, inputSource },
  });

  return NextResponse.json(insight, { status: 201 });
}
