import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId!;
  const body = await req.json();

  const existing = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.id, id), eq(schema.events.tenantId, tenantId)))
    .limit(1);

  if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(schema.events)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schema.events.id, id))
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "event.updated",
    resourceType: "event",
    resourceId: id,
    metadata: body,
  });

  return NextResponse.json(updated);
}
