import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logAudit, getRequestIp } from "@/lib/audit";
import { emailProvider, accessRequestRejectedEmail } from "@/lib/email";

// POST /api/access-requests/[id]/reject
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
    return NextResponse.json({ error: "Cannot reject an already-provisioned request." }, { status: 409 });
  }
  if (row.status === "rejected") {
    return NextResponse.json(row); // idempotent
  }

  const body = await req.json().catch(() => ({})) as {
    rejectionReason?: string;
    sendEmail?: boolean;
  };

  const [updated] = await db
    .update(schema.tenantAccessRequests)
    .set({
      status: "rejected",
      reviewedByUserId: session.user.id,
      reviewedAt: new Date(),
      rejectionReason: body.rejectionReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.tenantAccessRequests.id, id))
    .returning();

  await logAudit({
    action: "access_request_rejected",
    resourceType: "tenant_access_request",
    resourceId: id,
    userId: session.user.id,
    metadata: {
      companyName: row.companyName,
      contactEmail: row.contactEmail,
      rejectionReason: body.rejectionReason,
      sendEmail: body.sendEmail,
    },
    ipAddress: getRequestIp(req),
  });

  // Send rejection email only if admin explicitly opted in
  let emailResult: "sent" | "skipped" | "failed" = "skipped";
  if (body.sendEmail) {
    try {
      await emailProvider.send(
        accessRequestRejectedEmail({
          to: row.contactEmail,
          contactName: row.contactName,
          companyName: row.companyName,
          reason: body.rejectionReason,
        })
      );
      emailResult = "sent";
    } catch (err) {
      console.error("[access-requests/reject] email error:", err);
      emailResult = "failed";
    }
  }

  return NextResponse.json({ ...updated, emailResult });
}
