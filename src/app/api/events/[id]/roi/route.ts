import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";

// GET /api/events/[id]/roi — recalculates (deterministic, always fresh) and
// returns the full ROI breakdown for the executive dashboard.
// Booth users may only view metrics for events tied to leads they created.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { id: eventId } = await params;

  const eventRows = await db.select({ id: schema.events.id, name: schema.events.name }).from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, tenantId))).limit(1);
  if (!eventRows.length) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (session.user.role === "booth_user") {
    const [ownLead] = await db.select({ id: schema.leads.id }).from(schema.leads)
      .where(and(eq(schema.leads.eventId, eventId), eq(schema.leads.createdByUserId, session.user.id!))).limit(1);
    if (!ownLead) return NextResponse.json({ error: "No visibility into this event" }, { status: 403 });
  }

  const { record, result } = await recalculateAndStoreROI(eventId, tenantId, session.user.id);

  return NextResponse.json({
    eventName: eventRows[0].name,
    metrics: result,
    executiveSummary: record.executiveSummary,
    summaryGeneratedAt: record.summaryGeneratedAt,
    summaryConfidenceScore: record.summaryConfidenceScore,
  });
}
