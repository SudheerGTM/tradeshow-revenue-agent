import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

// GET /api/leads/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tenantId = session.user.tenantId!;

  const conditions = [
    eq(schema.leads.id, id),
    eq(schema.leads.tenantId, tenantId),
  ];

  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }

  const rows = await db
    .select()
    .from(schema.leads)
    .where(and(...conditions))
    .limit(1);

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch audit history for this lead
  const history = await db
    .select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      metadata: schema.auditLogs.metadata,
      createdAt: schema.auditLogs.createdAt,
      userId: schema.auditLogs.userId,
    })
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.resourceType, "lead"),
        eq(schema.auditLogs.resourceId, id)
      )
    )
    .orderBy(schema.auditLogs.createdAt);

  return NextResponse.json({ lead: rows[0], history });
}

// PATCH /api/leads/:id — status update or notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tenantId = session.user.tenantId!;

  const existing = await db
    .select({ id: schema.leads.id, status: schema.leads.status })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, id), eq(schema.leads.tenantId, tenantId)))
    .limit(1);

  if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { status, notes } = body as { status?: string; notes?: string };

  const [updated] = await db
    .update(schema.leads)
    .set({
      ...(status && { status: status as typeof schema.leads.$inferSelect["status"] }),
      ...(notes !== undefined && { notes }),
      updatedAt: new Date(),
    })
    .where(eq(schema.leads.id, id))
    .returning();

  const action = status && status !== existing[0].status
    ? "lead.status_changed"
    : "lead.updated";

  await logAudit({
    tenantId,
    userId: session.user.id,
    action,
    resourceType: "lead",
    resourceId: id,
    metadata: {
      ...(status && { from: existing[0].status, to: status }),
      ...(notes !== undefined && { notes }),
    },
  });

  return NextResponse.json(updated);
}
