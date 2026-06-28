import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and, desc, asc, or } from "drizzle-orm";
import { createOpportunityFromLead, logOpportunityActivity } from "@/lib/agents/opportunity-agent";
import type { OpportunityStage, OpportunityPriority, OpportunityStatus } from "@/db/schema";

// GET /api/opportunities — tenant-scoped list with filters + sort
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const stage     = searchParams.get("stage") as OpportunityStage | null;
  const priority  = searchParams.get("priority") as OpportunityPriority | null;
  const ownerId   = searchParams.get("ownerId");
  const eventId   = searchParams.get("eventId");
  const status    = searchParams.get("status") as OpportunityStatus | null;
  const leadId    = searchParams.get("leadId");
  const sortBy    = searchParams.get("sortBy") ?? "expectedRevenue";
  const sortDir   = searchParams.get("sortDir") === "asc" ? asc : desc;

  const conditions = [eq(schema.opportunities.tenantId, tenantId)];
  if (stage) conditions.push(eq(schema.opportunities.stage, stage));
  if (priority) conditions.push(eq(schema.opportunities.priority, priority));
  if (ownerId) conditions.push(eq(schema.opportunities.ownerUserId, ownerId));
  if (eventId) conditions.push(eq(schema.opportunities.eventId, eventId));
  if (status) conditions.push(eq(schema.opportunities.status, status));
  if (leadId) conditions.push(eq(schema.opportunities.leadId, leadId));

  if (session.user.role === "booth_user") {
    conditions.push(
      or(
        eq(schema.opportunities.createdByUserId, session.user.id!),
        eq(schema.opportunities.ownerUserId, session.user.id!)
      )!
    );
  }

  const sortColumn = sortBy === "amount" ? schema.opportunities.amount
    : sortBy === "closeDate" ? schema.opportunities.expectedCloseDate
    : schema.opportunities.expectedRevenue;

  const rows = await db
    .select({
      id: schema.opportunities.id,
      leadId: schema.opportunities.leadId,
      opportunityName: schema.opportunities.opportunityName,
      companyName: schema.opportunities.companyName,
      contactName: schema.opportunities.contactName,
      stage: schema.opportunities.stage,
      priority: schema.opportunities.priority,
      amount: schema.opportunities.amount,
      probability: schema.opportunities.probability,
      expectedRevenue: schema.opportunities.expectedRevenue,
      expectedCloseDate: schema.opportunities.expectedCloseDate,
      status: schema.opportunities.status,
      ownerUserId: schema.opportunities.ownerUserId,
      ownerName: schema.users.name,
      createdAt: schema.opportunities.createdAt,
      updatedAt: schema.opportunities.updatedAt,
    })
    .from(schema.opportunities)
    .leftJoin(schema.users, eq(schema.opportunities.ownerUserId, schema.users.id))
    .where(and(...conditions))
    .orderBy(sortDir(sortColumn));

  const mapped = rows.map(r => ({
    ...r,
    amount: r.amount != null ? parseFloat(r.amount as unknown as string) : null,
    probability: r.probability != null ? parseFloat(r.probability as unknown as string) : null,
    expectedRevenue: r.expectedRevenue != null ? parseFloat(r.expectedRevenue as unknown as string) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  }));

  return NextResponse.json(mapped);
}

// POST /api/opportunities — create an opportunity from a lead.
// Booth users may only create from their own Hot/Warm leads. Cold leads
// require managerOverride=true, which itself requires manager/tenant_admin.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (session.user.role === "platform_admin") {
    return NextResponse.json({ error: "Platform admins have read-only access to opportunities" }, { status: 403 });
  }

  const body = await req.json() as { leadId?: string; managerOverride?: boolean };
  const { leadId, managerOverride } = body;
  if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

  if (managerOverride && !["manager", "tenant_admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can override cold-lead opportunity creation" }, { status: 403 });
  }

  const conditions = [eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId)];
  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }
  const leadRows = await db.select().from(schema.leads).where(and(...conditions)).limit(1);
  if (!leadRows.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const lead = leadRows[0];

  try {
    const result = await createOpportunityFromLead(leadId, tenantId, { managerOverride });

    if (!result.allowed || !result.payload) {
      return NextResponse.json({ error: result.blockedReason, requiresManagerOverride: result.requiresManagerOverride }, { status: 422 });
    }

    const [score] = await db.select({ id: schema.leadScores.id }).from(schema.leadScores)
      .where(and(eq(schema.leadScores.leadId, leadId), eq(schema.leadScores.tenantId, tenantId)))
      .orderBy(desc(schema.leadScores.createdAt)).limit(1);

    // Idempotency (Release 13.7.1): only one active opportunity per lead.
    // Re-running creation (e.g. via repeated workflow execution) refreshes
    // the AI-derived fields on the existing active opportunity instead of
    // inserting a duplicate. Stage/priority/owner are left untouched here —
    // those reflect manual pipeline progress a user may have already made,
    // and a re-run must not regress them. A new opportunity is only created
    // if no active (non-won/lost/archived) one exists yet for this lead.
    const [existingActive] = await db.select({ id: schema.opportunities.id }).from(schema.opportunities)
      .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.leadId, leadId), eq(schema.opportunities.status, "active")))
      .limit(1);

    if (existingActive) {
      const opportunity = await db.transaction(async (tx) => {
        const [updated] = await tx.update(schema.opportunities).set({
          leadScoreId: score?.id ?? null,
          amount: result.payload!.amount != null ? String(result.payload!.amount) : null,
          probability: String(result.payload!.probability),
          expectedRevenue: result.payload!.expectedRevenue != null ? String(result.payload!.expectedRevenue) : null,
          nextStep: result.payload!.nextStep,
          riskNotes: result.payload!.riskNotes,
          aiRecommendation: result.payload!.aiRecommendation,
          updatedAt: new Date(),
        }).where(eq(schema.opportunities.id, existingActive.id)).returning();

        await logOpportunityActivity({
          tenantId, opportunityId: updated.id, leadId,
          userId: session.user.id,
          activityType: "note",
          description: "Opportunity refreshed from re-run workflow output (AI fields and expected revenue updated; stage/priority left as-is).",
          metadata: { amount: result.payload!.amount, expectedRevenue: result.payload!.expectedRevenue },
        }, tx);

        await logAudit({
          tenantId, userId: session.user.id,
          action: "opportunity_updated",
          resourceType: "opportunity",
          resourceId: updated.id,
          metadata: { leadId, amount: result.payload!.amount, refreshedExisting: true },
        }, tx);

        return updated;
      });

      return NextResponse.json(opportunity, { status: 200 });
    }

    const opportunity = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.opportunities).values({
        tenantId,
        eventId: lead.eventId ?? null,
        leadId,
        leadScoreId: score?.id ?? null,
        createdByUserId: session.user.id ?? null,
        ownerUserId: session.user.id ?? null,
        opportunityName: result.payload!.opportunityName,
        companyName: result.payload!.companyName,
        contactName: result.payload!.contactName,
        stage: result.payload!.stage,
        priority: result.payload!.priority,
        amount: result.payload!.amount != null ? String(result.payload!.amount) : null,
        probability: String(result.payload!.probability),
        expectedRevenue: result.payload!.expectedRevenue != null ? String(result.payload!.expectedRevenue) : null,
        nextStep: result.payload!.nextStep,
        riskNotes: result.payload!.riskNotes,
        aiRecommendation: result.payload!.aiRecommendation,
        source: "trade_show",
        status: "active",
      }).returning();

      await logOpportunityActivity({
        tenantId, opportunityId: created.id, leadId,
        userId: session.user.id,
        activityType: "stage_change",
        description: `Opportunity created at stage "${result.payload!.stage}"${managerOverride ? " (manager override from Cold classification)" : ""}.`,
        metadata: { stage: result.payload!.stage, priority: result.payload!.priority, managerOverride: !!managerOverride },
      }, tx);

      await logAudit({
        tenantId, userId: session.user.id,
        action: "opportunity_created",
        resourceType: "opportunity",
        resourceId: created.id,
        metadata: { leadId, stage: result.payload!.stage, amount: result.payload!.amount, managerOverride: !!managerOverride },
      }, tx);

      return created;
    });

    return NextResponse.json(opportunity, { status: 201 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to create opportunity";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
