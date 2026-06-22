import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { isManager } from "@/lib/permissions";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";
import type { EventCostCategory } from "@/db/schema";

// GET /api/events/[id]/costs — list costs + total for an event
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { id: eventId } = await params;

  const rows = await db.select({
    id: schema.eventCosts.id,
    costCategory: schema.eventCosts.costCategory,
    description: schema.eventCosts.description,
    amount: schema.eventCosts.amount,
    createdAt: schema.eventCosts.createdAt,
    createdByUserId: schema.eventCosts.createdByUserId,
    createdByName: schema.users.name,
  })
    .from(schema.eventCosts)
    .leftJoin(schema.users, eq(schema.eventCosts.createdByUserId, schema.users.id))
    .where(and(eq(schema.eventCosts.eventId, eventId), eq(schema.eventCosts.tenantId, tenantId)))
    .orderBy(desc(schema.eventCosts.createdAt));

  const total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

  return NextResponse.json({
    costs: rows.map(r => ({ ...r, amount: parseFloat(r.amount), createdAt: r.createdAt.toISOString() })),
    total,
  });
}

// POST /api/events/[id]/costs — add a cost line item. Manager / tenant_admin only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!isManager(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can add event costs" }, { status: 403 });
  }

  const { id: eventId } = await params;

  const eventRows = await db.select({ id: schema.events.id, name: schema.events.name }).from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, tenantId))).limit(1);
  if (!eventRows.length) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const body = await req.json() as { costCategory?: EventCostCategory; description?: string; amount?: number };
  const { costCategory, description, amount } = body;
  if (!costCategory) return NextResponse.json({ error: "costCategory is required" }, { status: 400 });
  if (amount == null || isNaN(amount) || amount < 0) return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });

  const [cost] = await db.insert(schema.eventCosts).values({
    tenantId, eventId, costCategory, description: description ?? null, amount: String(amount),
    createdByUserId: session.user.id ?? null,
  }).returning();

  await logAudit({
    tenantId, userId: session.user.id,
    action: "event_cost_added",
    resourceType: "event_roi",
    resourceId: eventId,
    metadata: { costId: cost.id, costCategory, amount },
  });

  // Keep cached ROI metrics in sync
  await recalculateAndStoreROI(eventId, tenantId, session.user.id);

  return NextResponse.json(cost, { status: 201 });
}
