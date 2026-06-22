import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";

// GET /api/events/[id]/report — full event report payload:
// metrics + executive summary + cost breakdown + top opportunities.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { id: eventId } = await params;

  const eventRows = await db.select().from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, tenantId))).limit(1);
  if (!eventRows.length) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const event = eventRows[0];

  if (session.user.role === "booth_user") {
    const [ownLead] = await db.select({ id: schema.leads.id }).from(schema.leads)
      .where(and(eq(schema.leads.eventId, eventId), eq(schema.leads.createdByUserId, session.user.id!))).limit(1);
    if (!ownLead) return NextResponse.json({ error: "No visibility into this event" }, { status: 403 });
  }

  const { record, result } = await recalculateAndStoreROI(eventId, tenantId, session.user.id);

  const costs = await db.select({
    id: schema.eventCosts.id, costCategory: schema.eventCosts.costCategory,
    description: schema.eventCosts.description, amount: schema.eventCosts.amount,
  }).from(schema.eventCosts).where(and(eq(schema.eventCosts.eventId, eventId), eq(schema.eventCosts.tenantId, tenantId)));

  const topOpportunities = await db.select({
    id: schema.opportunities.id, opportunityName: schema.opportunities.opportunityName,
    companyName: schema.opportunities.companyName, stage: schema.opportunities.stage,
    amount: schema.opportunities.amount, expectedRevenue: schema.opportunities.expectedRevenue,
  }).from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")))
    .orderBy(desc(schema.opportunities.expectedRevenue))
    .limit(10);

  return NextResponse.json({
    event: { id: event.id, name: event.name, location: event.location, startDate: event.startDate, endDate: event.endDate, status: event.status },
    metrics: result,
    executiveSummary: record.executiveSummary,
    summaryGeneratedAt: record.summaryGeneratedAt,
    summaryConfidenceScore: record.summaryConfidenceScore,
    costs: costs.map(c => ({ ...c, amount: parseFloat(c.amount) })),
    topOpportunities: topOpportunities.map(o => ({
      ...o,
      amount: o.amount != null ? parseFloat(o.amount) : null,
      expectedRevenue: o.expectedRevenue != null ? parseFloat(o.expectedRevenue) : null,
    })),
  });
}
