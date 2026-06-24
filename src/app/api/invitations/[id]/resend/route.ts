import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin } from "@/lib/permissions";
import { logAudit, getRequestIp } from "@/lib/audit";
import { getTenantById } from "@/lib/tenant";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { emailProvider, invitationEmail } from "@/lib/email";

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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
    .select()
    .from(schema.userInvitations)
    .where(and(eq(schema.userInvitations.id, id), eq(schema.userInvitations.tenantId, tenantId)))
    .limit(1);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invitation = rows[0];
  if (invitation.status === "accepted" || invitation.status === "cancelled") {
    return NextResponse.json({ error: `Cannot resend a ${invitation.status} invitation` }, { status: 400 });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const [updated] = await db
    .update(schema.userInvitations)
    .set({ invitationToken: token, status: "pending", expiresAt: new Date(Date.now() + EXPIRY_MS) })
    .where(eq(schema.userInvitations.id, id))
    .returning();

  const tenant = await getTenantById(tenantId);
  const inviteUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/invite/${token}`;

  await emailProvider.send(
    invitationEmail({
      to: invitation.email,
      firstName: invitation.firstName,
      tenantName: tenant?.name ?? "Trade Show Revenue Agent",
      invitedByName: session.user.name ?? "Your administrator",
      inviteUrl,
      message: invitation.message ?? undefined,
    })
  ).catch((err) => console.error("[invitations] failed to resend email:", err));

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "invitation_resent",
    resourceType: "user_invitation",
    resourceId: id,
    metadata: { email: invitation.email },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ ...updated, invitationToken: undefined });
}
