import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { validateEventICPAssignment, ICPTenantMismatchError } from "@/lib/icp/icp-resolver";
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
    .select({ id: schema.events.id, icpProfileId: schema.events.icpProfileId })
    .from(schema.events)
    .where(and(eq(schema.events.id, id), eq(schema.events.tenantId, tenantId)))
    .limit(1);

  if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // icpProfileId is handled explicitly (validated against tenant ownership)
  // rather than passed through with the rest of the body — never trust a
  // client-supplied ICP ID directly.
  const { icpProfileId, ...rest } = body as { icpProfileId?: string | null; [k: string]: unknown };
  const icpAssignmentChanged = icpProfileId !== undefined && icpProfileId !== existing[0].icpProfileId;

  if (icpAssignmentChanged) {
    try {
      await validateEventICPAssignment(tenantId, icpProfileId ?? null);
    } catch (err) {
      if (err instanceof ICPTenantMismatchError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  }

  const [updated] = await db
    .update(schema.events)
    .set({ ...rest, ...(icpProfileId !== undefined ? { icpProfileId: icpProfileId ?? null } : {}), updatedAt: new Date() })
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

  if (icpAssignmentChanged) {
    await logAudit({
      tenantId,
      userId: session.user.id,
      action: "event_icp_assigned",
      resourceType: "event",
      resourceId: id,
      metadata: { icpProfileId: icpProfileId ?? null },
    });
  }

  return NextResponse.json(updated);
}
