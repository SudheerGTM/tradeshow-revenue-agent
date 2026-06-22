import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { FollowupPriority, FollowupStatus, ScoreClassification } from "@/db/schema";

// GET /api/followups
//   ?lead_id=        -> history for a single lead
//   ?priority=high   -> queue filters
//   ?status=draft
//   ?classification=hot   (joins latest lead score)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const leadId         = searchParams.get("lead_id");
  const priority        = searchParams.get("priority") as FollowupPriority | null;
  const status          = searchParams.get("status") as FollowupStatus | null;
  const classification  = searchParams.get("classification") as ScoreClassification | null;

  // Single-lead history (used by Lead Details page)
  if (leadId) {
    const conditions = [
      eq(schema.followupRecommendations.leadId, leadId),
      eq(schema.followupRecommendations.tenantId, tenantId),
    ];
    if (session.user.role === "booth_user") {
      const leadRows = await db.select({ id: schema.leads.id }).from(schema.leads)
        .where(and(eq(schema.leads.id, leadId), eq(schema.leads.createdByUserId, session.user.id!)))
        .limit(1);
      if (!leadRows.length) return NextResponse.json([], { status: 200 });
    }

    const rows = await db
      .select()
      .from(schema.followupRecommendations)
      .where(and(...conditions))
      .orderBy(desc(schema.followupRecommendations.createdAt));

    return NextResponse.json(rows);
  }

  // Queue listing
  const conditions = [eq(schema.followupRecommendations.tenantId, tenantId)];
  if (priority) conditions.push(eq(schema.followupRecommendations.priority, priority));
  if (status) conditions.push(eq(schema.followupRecommendations.status, status));

  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }

  // Latest score per lead for classification join/filter
  const latestScoreSq = db
    .selectDistinctOn([schema.leadScores.leadId], {
      leadId: schema.leadScores.leadId,
      score: schema.leadScores.score,
      classification: schema.leadScores.classification,
    })
    .from(schema.leadScores)
    .where(eq(schema.leadScores.tenantId, tenantId))
    .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt))
    .as("latest_score");

  const rows = await db
    .select({
      id: schema.followupRecommendations.id,
      leadId: schema.followupRecommendations.leadId,
      leadFirstName: schema.leads.firstName,
      leadLastName: schema.leads.lastName,
      companyName: schema.leads.companyName,
      followupType: schema.followupRecommendations.followupType,
      priority: schema.followupRecommendations.priority,
      recommendedTiming: schema.followupRecommendations.recommendedTiming,
      status: schema.followupRecommendations.status,
      confidenceScore: schema.followupRecommendations.confidenceScore,
      needsHumanReview: schema.followupRecommendations.needsHumanReview,
      createdAt: schema.followupRecommendations.createdAt,
      score: latestScoreSq.score,
      classification: latestScoreSq.classification,
    })
    .from(schema.followupRecommendations)
    .innerJoin(schema.leads, eq(schema.followupRecommendations.leadId, schema.leads.id))
    .leftJoin(latestScoreSq, eq(schema.followupRecommendations.leadId, latestScoreSq.leadId))
    .where(and(...conditions))
    .orderBy(
      sql`CASE ${schema.followupRecommendations.priority} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
      desc(schema.followupRecommendations.createdAt)
    );

  const filtered = classification ? rows.filter(r => r.classification === classification) : rows;

  const mapped = filtered.map(r => ({
    ...r,
    score: r.score != null ? parseFloat(r.score as unknown as string) : null,
    confidenceScore: r.confidenceScore != null ? parseFloat(r.confidenceScore as unknown as string) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));

  return NextResponse.json(mapped);
}
