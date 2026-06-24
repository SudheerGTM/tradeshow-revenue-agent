import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin } from "@/lib/permissions";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { id } = await params;
  const rows = await db
    .select({ id: schema.userInvitations.id, email: schema.userInvitations.email })
    .from(schema.userInvitations)
    .where(and(eq(schema.userInvitations.id, id), eq(schema.userInvitations.tenantId, tenantId)))
    .limit(1);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
