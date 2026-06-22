import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { logOpportunityActivity, STAGE_PROBABILITY } from "@/lib/agents/opportunity-agent";
import type { OpportunityStage } from "@/db/schema";

// GET /api/opportunities/[id] — full detail with linked lead/score/insight/
// company/followup/crm-sync context + activity timeline.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { id } = await params;

  const conditions = [eq(schema.opportunities.id, id), eq(schema.opportunities.tenantId, tenantId)];
  const rows = await db.select().from(schema.opportunities).where(and(...conditions)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  const opportunity = rows[0];

  if (session.user.role === "booth_user" &&
      opportunity.createdByUserId !== session.user.id &&
      opportunity.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: "Not authorized to view this opportunity" }, { status: 403 });
  }

  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, opportunity.leadId)).limit(1);

  const [insight] = await db.select().from(schema.conversationInsights)
    .where(and(eq(schema.conversationInsights.leadId, opportunity.leadId), eq(schema.conversationInsights.tenantId, tenantId)))
    .orderBy(desc(schema.conversationInsights.createdAt)).limit(1);

  const [company] = await db.select().from(schema.companyEnrichment)
    .where(and(eq(schema.companyEnrichment.leadId, opportunity.leadId), eq(schema.companyEnrichment.tenantId, tenantId)))
    .orderBy(desc(schema.companyEnrichment.updatedAt)).limit(1);

  const [score] = await db.select().from(schema.leadScores)
    .where(and(eq(schema.leadScores.leadId, opportunity.leadId), eq(schema.leadScores.tenantId, tenantId)))
    .orderBy(desc(schema.leadScores.createdAt)).limit(1);

  const [followup] = await db.select().from(schema.followupRecommendations)
    .where(and(eq(schema.followupRecommendations.leadId, opportunity.leadId), eq(schema.followupRecommendations.tenantId, tenantId)))
    .orderBy(desc(schema.followupRecommendations.createdAt)).limit(1);

  const [crmJob] = await db.select().from(schema.crmSyncJobs)
    .where(and(eq(schema.crmSyncJobs.leadId, opportunity.leadId), eq(schema.crmSyncJobs.tenantId, tenantId)))
    .orderBy(desc(schema.crmSyncJobs.createdAt)).limit(1);

  const activities = await db.select({
    id: schema.opportunityActivities.id,
    activityType: schema.opportunityActivities.activityType,
    description: schema.opportunityActivities.description,
    metadata: schema.opportunityActivities.metadata,
    createdAt: schema.opportunityActivities.createdAt,
    userName: schema.users.name,
  })
    .from(schema.opportunityActivities)
    .leftJoin(schema.users, eq(schema.opportunityActivities.createdByUserId, schema.users.id))
    .where(eq(schema.opportunityActivities.opportunityId, id))
    .orderBy(desc(schema.opportunityActivities.createdAt));

  let ownerName: string | null = null;
  if (opportunity.ownerUserId) {
    const [owner] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, opportunity.ownerUserId)).limit(1);
    ownerName = owner?.name ?? null;
  }

  return NextResponse.json({
    opportunity, lead, insight, company, score, followup, crmJob, activities, ownerName,
  });
}

// PATCH /api/opportunities/[id] — edit fields.
// Booth users (own opportunities only): nextStep, riskNotes, stage.
// Manager/tenant_admin: all fields including amount, probability, owner.
// Platform admin: read-only, no edits allowed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (session.user.role === "platform_admin") {
    return NextResponse.json({ error: "Platform admins have read-only access to opportunities" }, { status: 403 });
  }

  const { id } = await params;
  const conditions = [eq(schema.opportunities.id, id), eq(schema.opportunities.tenantId, tenantId)];
  const rows = await db.select().from(schema.opportunities).where(and(...conditions)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  const existing = rows[0];

  const isOwnerOrCreator = existing.createdByUserId === session.user.id || existing.ownerUserId === session.user.id;
  if (session.user.role === "booth_user" && !isOwnerOrCreator) {
    return NextResponse.json({ error: "You can only edit your own opportunities" }, { status: 403 });
  }

  const canEditFinancials = ["manager", "tenant_admin"].includes(session.user.role);

  const body = await req.json() as {
    stage?: OpportunityStage;
    ownerUserId?: string;
    amount?: number;
    probability?: number;
    expectedCloseDate?: string;
    nextStep?: string;
    riskNotes?: string;
    status?: "active" | "won" | "lost" | "archived";
  };

  if (!canEditFinancials && (body.amount !== undefined || body.probability !== undefined || body.ownerUserId !== undefined)) {
    return NextResponse.json({ error: "Only managers and tenant admins can edit amount, probability, or owner" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const auditEvents: { action: string; metadata: Record<string, unknown> }[] = [];

  if (body.stage && body.stage !== existing.stage) {
    updates.stage = body.stage;
    // Auto-update probability to the stage default unless the caller also
    // sent an explicit probability override in the same request.
    if (body.probability === undefined) {
      updates.probability = String(STAGE_PROBABILITY[body.stage]);
    }
    if (body.stage === "won") updates.status = "won";
    else if (body.stage === "lost") updates.status = "lost";

    await logOpportunityActivity({
      tenantId, opportunityId: id, leadId: existing.leadId, userId: session.user.id,
      activityType: "stage_change",
      description: `Stage changed from "${existing.stage}" to "${body.stage}".`,
      metadata: { from: existing.stage, to: body.stage },
    });

    auditEvents.push({ action: "opportunity_stage_changed", metadata: { from: existing.stage, to: body.stage } });
    if (body.stage === "won") auditEvents.push({ action: "opportunity_won", metadata: { amount: existing.amount } });
    if (body.stage === "lost") auditEvents.push({ action: "opportunity_lost", metadata: { amount: existing.amount } });
  }

  const existingAmount = existing.amount != null ? parseFloat(existing.amount) : null;
  if (body.amount !== undefined && body.amount !== existingAmount) {
    updates.amount = String(body.amount);
    auditEvents.push({ action: "opportunity_amount_changed", metadata: { from: existingAmount, to: body.amount } });
  }

  if (body.probability !== undefined) {
    updates.probability = String(body.probability);
  }

  if (body.ownerUserId !== undefined && body.ownerUserId !== existing.ownerUserId) {
    updates.ownerUserId = body.ownerUserId;
    auditEvents.push({ action: "opportunity_owner_changed", metadata: { from: existing.ownerUserId, to: body.ownerUserId } });
  }

  if (body.expectedCloseDate !== undefined) updates.expectedCloseDate = body.expectedCloseDate;
  if (body.nextStep !== undefined) updates.nextStep = body.nextStep;
  if (body.riskNotes !== undefined) updates.riskNotes = body.riskNotes;
  if (body.status !== undefined) updates.status = body.status;

  // Recompute expected revenue if amount or probability changed
  const finalAmount = updates.amount !== undefined ? Number(updates.amount) : existing.amount != null ? parseFloat(existing.amount) : null;
  const finalProbability = updates.probability !== undefined ? Number(updates.probability) : existing.probability != null ? parseFloat(existing.probability) : null;
  if (finalAmount != null && finalProbability != null) {
    updates.expectedRevenue = String(Math.round(finalAmount * finalProbability));
  }

  const [updated] = await db.update(schema.opportunities).set(updates).where(eq(schema.opportunities.id, id)).returning();

  for (const event of auditEvents) {
    await logAudit({
      tenantId, userId: session.user.id,
      action: event.action,
      resourceType: "opportunity",
      resourceId: id,
      metadata: event.metadata,
    });
  }

  if (auditEvents.length === 0) {
    await logAudit({
      tenantId, userId: session.user.id,
      action: "opportunity_updated",
      resourceType: "opportunity",
      resourceId: id,
      metadata: { fields: Object.keys(body) },
    });
  }

  return NextResponse.json(updated);
}
