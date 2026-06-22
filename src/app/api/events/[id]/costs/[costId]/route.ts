import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { isManager } from "@/lib/permissions";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";
import type { EventCostCategory } from "@/db/schema";

// PATCH /api/events/[id]/costs/[costId] — manager / tenant_admin only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; costId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!isManager(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can edit event costs" }, { status: 403 });
  }

  const { id: eventId, costId } = await params;
  const rows = await db.select().from(schema.eventCosts)
    .where(and(eq(schema.eventCosts.id, costId), eq(schema.eventCosts.eventId, eventId), eq(schema.eventCosts.tenantId, tenantId))).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Cost not found" }, { status: 404 });
  const existing = rows[0];

  const body = await req.json() as { costCategory?: EventCostCategory; description?: string; amount?: number };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.costCategory !== undefined) updates.costCategory = body.costCategory;
  if (body.description !== undefined) updates.description = body.description;
  if (body.amount !== undefined) updates.amount = String(body.amount);

  const [updated] = await db.update(schema.eventCosts).set(updates).where(eq(schema.eventCosts.id, costId)).returning();

  await logAudit({
    tenantId, userId: session.user.id,
    action: "event_cost_updated",
    resourceType: "event_roi",
    resourceId: eventId,
    metadata: { costId, from: existing.amount, to: body.amount ?? existing.amount },
  });

  await recalculateAndStoreROI(eventId, tenantId, session.user.id);

  return NextResponse.json(updated);
}

// DELETE /api/events/[id]/costs/[costId] — manager / tenant_admin only.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; costId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!isManager(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can delete event costs" }, { status: 403 });
  }

  const { id: eventId, costId } = await params;
  const rows = await db.select().from(schema.eventCosts)
    .where(and(eq(schema.eventCosts.id, costId), eq(schema.eventCosts.eventId, eventId), eq(schema.eventCosts.tenantId, tenantId))).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Cost not found" }, { status: 404 });

  await db.delete(schema.eventCosts).where(eq(schema.eventCosts.id, costId));

  await logAudit({
    tenantId, userId: session.user.id,
    action: "event_cost_updated",
    resourceType: "event_roi",
    resourceId: eventId,
    metadata: { costId, deleted: true, amount: rows[0].amount },
  });

  await recalculateAndStoreROI(eventId, tenantId, session.user.id);

  return NextResponse.json({ ok: true });
}
