import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin, isPlatformAdmin, canAssignRole } from "@/lib/permissions";
import { logAudit, getRequestIp } from "@/lib/audit";
import { getTenantById } from "@/lib/tenant";
import { db, schema } from "@/db";
import { eq, and, lt, gt, desc } from "drizzle-orm";
import crypto from "crypto";
import { emailProvider, invitationEmail } from "@/lib/email";
import type { UserRole } from "@/db/schema";

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// GET /api/invitations — tenant-scoped list
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = isPlatformAdmin(session.user.role)
    ? new URL(req.url).searchParams.get("tenantId") ?? session.user.tenantId
    : session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  // Lazily flip stale pending invitations to expired
  await db
    .update(schema.userInvitations)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.userInvitations.tenantId, tenantId),
        eq(schema.userInvitations.status, "pending"),
        lt(schema.userInvitations.expiresAt, new Date())
      )
    );

  const rows = await db
    .select()
    .from(schema.userInvitations)
    .where(eq(schema.userInvitations.tenantId, tenantId))
    .orderBy(desc(schema.userInvitations.createdAt));

  return NextResponse.json(rows);
}

// POST /api/invitations — create + send invitation
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, firstName, lastName, role, eventAccess, message, tenantId: bodyTenantId } = body as {
    email: string; firstName: string; lastName?: string; role: UserRole;
    eventAccess?: "all" | string[]; message?: string; tenantId?: string;
  };

  if (!email || !firstName || !role) {
    return NextResponse.json({ error: "email, firstName, role required" }, { status: 400 });
  }

  const targetTenantId = isPlatformAdmin(session.user.role)
    ? (bodyTenantId ?? session.user.tenantId)
    : session.user.tenantId;
  if (!targetTenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!canAssignRole(session.user.role, role)) {
    return NextResponse.json({ error: `Cannot assign role: ${role}` }, { status: 403 });
  }

  const existingUser = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existingUser.length) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const existingInvite = await db
    .select({ id: schema.userInvitations.id })
    .from(schema.userInvitations)
    .where(
      and(
        eq(schema.userInvitations.email, email),
        eq(schema.userInvitations.tenantId, targetTenantId),
        eq(schema.userInvitations.status, "pending"),
        gt(schema.userInvitations.expiresAt, new Date())
      )
    )
    .limit(1);
  if (existingInvite.length) {
    return NextResponse.json({ error: "An active invitation already exists for this email" }, { status: 409 });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const [invitation] = await db
    .insert(schema.userInvitations)
    .values({
      tenantId: targetTenantId,
      email, firstName, lastName,
      role,
      eventAccess: eventAccess ?? "all",
      message,
      invitationToken: token,
      status: "pending",
      expiresAt: new Date(Date.now() + EXPIRY_MS),
      invitedBy: session.user.id,
    })
    .returning();

  const tenant = await getTenantById(targetTenantId);
  const inviteUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/invite/${token}`;

  await emailProvider.send(
    invitationEmail({
      to: email,
      firstName,
      tenantName: tenant?.name ?? "Trade Show Revenue Agent",
      invitedByName: session.user.name ?? "Your administrator",
      inviteUrl,
      message,
    })
  ).catch((err) => console.error("[invitations] failed to send email:", err));

  await logAudit({
    tenantId: targetTenantId,
    userId: session.user.id,
    action: "user_invited",
    resourceType: "user_invitation",
    resourceId: invitation.id,
    metadata: { email, role },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ ...invitation, invitationToken: undefined }, { status: 201 });
}
