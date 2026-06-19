import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin, isPlatformAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

// PATCH /api/users/:id — activate/deactivate or change role
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
  const { status, role } = body as { status?: "active" | "inactive"; role?: string };

  // Non-platform admins may only touch users in their own tenant
  const target = await db
    .select({ id: schema.users.id, tenantId: schema.users.tenantId })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  if (!target.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (
    !isPlatformAdmin(session.user.role) &&
    target[0].tenantId !== session.user.tenantId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [updated] = await db
    .update(schema.users)
    .set({
      ...(status && { status }),
      ...(role   && { role: role as typeof schema.users.$inferSelect["role"] }),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, id))
    .returning({
      id: schema.users.id, name: schema.users.name,
      email: schema.users.email, role: schema.users.role,
      status: schema.users.status, tenantId: schema.users.tenantId,
    });

  await logAudit({
    tenantId:     target[0].tenantId,
    userId:       session.user.id,
    action:       "user.updated",
    resourceType: "user",
    resourceId:   id,
    metadata:     body,
  });

  return NextResponse.json(updated);
}
