import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { validatePasswordStrength, isPasswordReused, recordPasswordHistory } from "@/lib/password";
import { logAudit, getRequestIp } from "@/lib/audit";

// POST /api/auth/change-password — authenticated self-service
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = (await req.json()) as {
    currentPassword: string; newPassword: string;
  };
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "currentPassword and newPassword required" }, { status: 400 });
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return NextResponse.json({ error: strength.errors.join(", ") }, { status: 400 });
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id!))
    .limit(1);
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  if (await isPasswordReused(user.id, newPassword)) {
    return NextResponse.json({ error: "You cannot reuse one of your last 5 passwords" }, { status: 400 });
  }

  await recordPasswordHistory(user.id, user.passwordHash);

  const newHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(schema.users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));

  await logAudit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "password_changed",
    resourceType: "user",
    resourceId: user.id,
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ success: true });
}
