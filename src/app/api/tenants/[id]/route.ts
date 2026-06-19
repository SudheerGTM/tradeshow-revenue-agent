import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// PATCH /api/tenants/:id — platform_admin only
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, eventName, status } = body as {
    name?: string; eventName?: string; status?: "active" | "inactive";
  };

  const [updated] = await db
    .update(schema.tenants)
    .set({
      ...(name       && { name }),
      ...(eventName  !== undefined && { eventName }),
      ...(status     && { status }),
      updatedAt: new Date(),
    })
    .where(eq(schema.tenants.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logAudit({
    userId:       session.user.id,
    action:       "tenant.updated",
    resourceType: "tenant",
    resourceId:   id,
    metadata:     body,
  });

  return NextResponse.json(updated);
}
