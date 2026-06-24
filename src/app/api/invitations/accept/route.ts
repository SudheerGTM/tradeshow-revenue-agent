import { NextRequest, NextResponse } from "next/server";
import { logAudit, getRequestIp } from "@/lib/audit";
import { getTenantById } from "@/lib/tenant";
import { validatePasswordStrength } from "@/lib/password";
import { db, schema } from "@/db";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { emailProvider, accountActivatedEmail } from "@/lib/email";

// POST /api/invitations/accept — public, token-based
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, password } = body as { token: string; password: string };

  if (!token || !password) {
    return NextResponse.json({ error: "token and password required" }, { status: 400 });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return NextResponse.json({ error: strength.errors.join(", ") }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(schema.userInvitations)
    .where(
      and(
        eq(schema.userInvitations.invitationToken, token),
        eq(schema.userInvitations.status, "pending"),
        gt(schema.userInvitations.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!rows.length) {
    return NextResponse.json({ error: "Invitation is invalid or has expired" }, { status: 404 });
  }
  const invitation = rows[0];

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, invitation.email))
    .limit(1);
  if (existing.length) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const allEvents = invitation.eventAccess === "all" || !invitation.eventAccess;

  const [user] = await db
    .insert(schema.users)
    .values({
      tenantId: invitation.tenantId,
      name: [invitation.firstName, invitation.lastName].filter(Boolean).join(" "),
      email: invitation.email,
      passwordHash,
      role: invitation.role,
      status: "active",
      allEvents,
    })
    .returning();

  if (!allEvents && Array.isArray(invitation.eventAccess)) {
    const eventIds = invitation.eventAccess as string[];
    if (eventIds.length) {
      await db.insert(schema.userEventAccess).values(
        eventIds.map((eventId) => ({ userId: user.id, eventId }))
      );
    }
  }

  await db
    .update(schema.userInvitations)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(schema.userInvitations.id, invitation.id));

  const tenant = await getTenantById(invitation.tenantId);
  await emailProvider.send(
    accountActivatedEmail({
      to: user.email,
      firstName: invitation.firstName,
      tenantName: tenant?.name ?? "Trade Show Revenue Agent",
    })
  ).catch((err) => console.error("[invitations] failed to send activation email:", err));

  await logAudit({
    tenantId: invitation.tenantId,
    userId: user.id,
    action: "invitation_accepted",
    resourceType: "user",
    resourceId: user.id,
    metadata: { email: user.email },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ email: user.email });
}
