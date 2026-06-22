import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { isManager } from "@/lib/permissions";
import { calculateEventROI, generateExecutiveSummary } from "@/lib/agents/roi-agent";

// POST /api/events/[id]/executive-summary — generates (or regenerates) the
// AI executive summary from already-calculated, deterministic metrics.
// Manager / tenant_admin only — matches who can act on ROI data.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!isManager(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can generate the executive summary" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const eventRows = await db.select({ id: schema.events.id, name: schema.events.name }).from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, tenantId))).limit(1);
  if (!eventRows.length) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  try {
    const metrics = await calculateEventROI(eventId, tenantId);
    const result = await generateExecutiveSummary(eventId, tenantId, eventRows[0].name, metrics, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to generate executive summary";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
