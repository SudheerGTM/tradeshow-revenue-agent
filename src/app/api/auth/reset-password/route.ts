import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { validatePasswordStrength, isPasswordReused, recordPasswordHistory } from "@/lib/password";
import { logAudit, getRequestIp } from "@/lib/audit";

// POST /api/auth/reset-password — public, token-based
export async function POST(req: NextRequest) {
  const { token, password } = (await req.json()) as { token: string; password: string };
  if (!token || !password) {
    return NextResponse.json({ error: "token and password required" }, { status: 400 });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return NextResponse.json({ error: strength.errors.join(", ") }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.token, token),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!rows.length) {
    return NextResponse.json({ error: "Reset link is invalid or has expired" }, { status: 404 });
  }
  const resetToken = rows[0];

  if (await isPasswordReused(resetToken.userId, password)) {
    return NextResponse.json({ error: "You cannot reuse one of your last 5 passwords" }, { status: 400 });
  }

  const [user] = await db
    .select({ passwordHash: schema.users.passwordHash, tenantId: schema.users.tenantId, status: schema.users.status })
    .from(schema.users)
    .where(eq(schema.users.id, resetToken.userId))
    .limit(1);
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  await recordPasswordHistory(resetToken.userId, user.passwordHash);

  const newHash = await bcrypt.hash(password, 12);
  await db
    .update(schema.users)
    .set({
      passwordHash: newHash,
      failedLoginAttempts: 0,
      ...(user.status === "locked" && { status: "active", lockedAt: null }),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, resetToken.userId));

  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetTokens.id, resetToken.id));

  await logAudit({
    tenantId: user.tenantId,
    userId: resetToken.userId,
    action: "password_reset",
    resourceType: "user",
    resourceId: resetToken.userId,
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ success: true });
}
