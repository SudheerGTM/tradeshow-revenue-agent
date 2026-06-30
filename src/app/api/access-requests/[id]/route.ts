import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logAudit, getRequestIp } from "@/lib/audit";

// GET /api/access-requests/[id] — platform admin only
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const [row] = await db
    .select()
    .from(schema.tenantAccessRequests)
    .where(eq(schema.tenantAccessRequests.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

// PATCH /api/access-requests/[id] — update admin_notes or move to under_review
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const [row] = await db
    .select({ id: schema.tenantAccessRequests.id, status: schema.tenantAccessRequests.status })
    .from(schema.tenantAccessRequests)
    .where(eq(schema.tenantAccessRequests.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as { adminNotes?: string; status?: "under_review" };

  const updates: Partial<typeof schema.tenantAccessRequests.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.adminNotes === "string") updates.adminNotes = body.adminNotes;
  if (body.status === "under_review" && row.status === "requested") {
    updates.status = "under_review";
    updates.reviewedByUserId = session.user.id;
    updates.reviewedAt = new Date();
  }

  const [updated] = await db
    .update(schema.tenantAccessRequests)
    .set(updates)
    .where(eq(schema.tenantAccessRequests.id, id))
    .returning();

  if (body.status === "under_review") {
    await logAudit({
      action: "access_request_reviewed",
      resourceType: "tenant_access_request",
      resourceId: id,
      userId: session.user.id,
      metadata: { status: "under_review" },
      ipAddress: getRequestIp(req),
    });
  }

  return NextResponse.json(updated);
}
