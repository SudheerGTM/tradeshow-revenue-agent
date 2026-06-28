import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin } from "@/lib/permissions";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  // Derive the target tenant from the invitation itself, not the session —
  // platform_admin's session.user.tenantId is null by design (cross-tenant
  // role), so deriving from session would make this route unusable for
  // platform_admin on any tenant's invitation. tenant_admin is still scoped
  // to their own tenant via the check below.
  const rows = await db
    .select({ id: schema.userInvitations.id, email: schema.userInvitations.email, tenantId: schema.userInvitations.tenantId })
    .from(schema.userInvitations)
    .where(eq(schema.userInvitations.id, id))
    .limit(1);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role !== "platform_admin" && rows[0].tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const tenantId = rows[0].tenantId;

  await db
    .update(schema.userInvitations)
    .set({ status: "cancelled" })
    .where(eq(schema.userInvitations.id, id));

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "invitation_cancelled",
    resourceType: "user_invitation",
    resourceId: id,
    metadata: { email: rows[0].email },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ success: true });
}
