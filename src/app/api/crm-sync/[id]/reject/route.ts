import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

// POST /api/crm-sync/[id]/reject — manager/tenant_admin only.
// Rejecting a pending sync removes the job — no "rejected" state is kept
// in the queue (matches the queue filters: Pending Approval / Approved /
// Completed / Failed). The audit log is the permanent record of the rejection.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!["manager", "tenant_admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can reject CRM syncs" }, { status: 403 });
  }

  const { id } = await params;

  const rows = await db.select().from(schema.crmSyncJobs)
    .where(and(eq(schema.crmSyncJobs.id, id), eq(schema.crmSyncJobs.tenantId, tenantId))).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Sync job not found" }, { status: 404 });
  if (rows[0].syncStatus !== "pending_approval") {
    return NextResponse.json({ error: `Job is already '${rows[0].syncStatus}' — cannot reject` }, { status: 409 });
  }

  await logAudit({
    tenantId, userId: session.user.id,
    action: "crm_sync_rejected",
    resourceType: "crm_sync",
    resourceId: id,
    metadata: { leadId: rows[0].leadId, payload: rows[0].syncPayload },
  });

  await db.delete(schema.crmSyncJobs).where(eq(schema.crmSyncJobs.id, id));

  return NextResponse.json({ ok: true });
}
