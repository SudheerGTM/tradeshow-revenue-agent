import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { executeSync } from "@/lib/agents/crm-sync-agent";

// POST /api/crm-sync/[id]/approve — manager/tenant_admin only.
// Marks the job approved, then immediately executes the HubSpot writes.
// This is the only path in the codebase that calls executeSync().
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!["manager", "tenant_admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can approve CRM syncs" }, { status: 403 });
  }

  const { id } = await params;

  const rows = await db.select().from(schema.crmSyncJobs)
    .where(and(eq(schema.crmSyncJobs.id, id), eq(schema.crmSyncJobs.tenantId, tenantId))).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Sync job not found" }, { status: 404 });
  if (rows[0].syncStatus !== "pending_approval") {
    return NextResponse.json({ error: `Job is already '${rows[0].syncStatus}' — cannot approve again` }, { status: 409 });
  }

  await db.update(schema.crmSyncJobs).set({
    syncStatus: "approved",
    approvedByUserId: session.user.id,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(schema.crmSyncJobs.id, id));

  await logAudit({
    tenantId, userId: session.user.id,
    action: "crm_sync_approved",
    resourceType: "crm_sync",
    resourceId: id,
    metadata: { leadId: rows[0].leadId },
  });

  try {
    const result = await executeSync(id, tenantId);
    return NextResponse.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "CRM sync execution failed";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
