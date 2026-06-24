import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin, isPlatformAdmin } from "@/lib/permissions";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { emailProvider, passwordResetEmail } from "@/lib/email";

const EXPIRY_MS = 60 * 60 * 1000; // 1 hour — same window as the self-service forgot-password flow

// POST /api/users/:id/reset-password — admin-initiated; emails the user a secure
// reset link instead of generating a temporary password.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = rows[0];

  if (!isPlatformAdmin(session.user.role) && user.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(schema.passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt: new Date(Date.now() + EXPIRY_MS),
  });

  const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
  await emailProvider.send(
    passwordResetEmail({ to: user.email, firstName: user.name.split(" ")[0] || user.name, resetUrl })
  ).catch((err) => console.error("[users] failed to send password reset email:", err));

  await logAudit({
    tenantId: user.tenantId,
    userId: session.user.id,
    action: "password_reset_requested",
    resourceType: "user",
    resourceId: id,
    metadata: { targetEmail: user.email, initiatedByAdmin: true },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ success: true });
}
