import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logAudit, getRequestIp } from "@/lib/audit";

// POST /api/access-requests/[id]/approve — platform admin only
// Marks the request as approved. Provisioning is triggered separately via /provision
// so the admin can see a preview before committing.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  if (row.status === "provisioned") {
    return NextResponse.json({ error: "Request already provisioned." }, { status: 409 });
  }
  if (row.status === "rejected") {
    return NextResponse.json({ error: "Cannot approve a rejected request." }, { status: 409 });
  }
  if (row.status === "approved") {
    return NextResponse.json(row); // idempotent
  }

  const [updated] = await db
    .update(schema.tenantAccessRequests)
    .set({
      status: "approved",
      reviewedByUserId: session.user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.tenantAccessRequests.id, id))
    .returning();

  await logAudit({
    action: "access_request_approved",
    resourceType: "tenant_access_request",
    resourceId: id,
    userId: session.user.id,
    metadata: { companyName: row.companyName, contactEmail: row.contactEmail },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(updated);
}
