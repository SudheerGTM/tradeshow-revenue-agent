import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin, isPlatformAdmin } from "@/lib/permissions";
import { logAudit, getRequestIp } from "@/lib/audit";
import { getTenantById } from "@/lib/tenant";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { emailProvider, accountSuspendedEmail } from "@/lib/email";
import type { UserStatus } from "@/db/schema";

// PATCH /api/users/:id — activate/deactivate/suspend/unlock, or change role.
// Password resets are handled separately via POST /api/users/:id/reset-password
// (emails a secure link) — this endpoint never accepts a raw password.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status, role, unlock } = body as {
    status?: UserStatus; role?: string; unlock?: boolean;
  };

  // Non-platform admins may only touch users in their own tenant
  const target = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!target.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const before = target[0];

  if (!isPlatformAdmin(session.user.role) && before.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [updated] = await db
    .update(schema.users)
    .set({
      ...(status && { status }),
      ...(role && { role: role as typeof schema.users.$inferSelect["role"] }),
      ...(unlock && { failedLoginAttempts: 0, lockedAt: null }),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, id))
    .returning({
      id: schema.users.id, name: schema.users.name,
      email: schema.users.email, role: schema.users.role,
      status: schema.users.status, tenantId: schema.users.tenantId,
    });

  const ipAddress = getRequestIp(req);

  if (role && role !== before.role) {
    await logAudit({
      tenantId: before.tenantId, userId: session.user.id, action: "role_changed",
      resourceType: "user", resourceId: id, metadata: { from: before.role, to: role }, ipAddress,
    });
  }
  if (status && status !== before.status) {
    if (status === "suspended") {
      await logAudit({
        tenantId: before.tenantId, userId: session.user.id, action: "user_suspended",
        resourceType: "user", resourceId: id, ipAddress,
      });
      const tenant = before.tenantId ? await getTenantById(before.tenantId) : null;
      await emailProvider.send(
        accountSuspendedEmail({
          to: before.email,
          firstName: before.name.split(" ")[0] || before.name,
          tenantName: tenant?.name ?? "Trade Show Revenue Agent",
        })
      ).catch((err) => console.error("[users] failed to send suspension email:", err));
    } else if (status === "active") {
      await logAudit({
        tenantId: before.tenantId, userId: session.user.id, action: "user_activated",
        resourceType: "user", resourceId: id, metadata: { from: before.status }, ipAddress,
      });
    }
  }

  return NextResponse.json(updated);
}
