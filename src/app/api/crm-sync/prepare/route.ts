import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { prepareCRMRecord } from "@/lib/agents/crm-sync-agent";

// POST /api/crm-sync/prepare — builds a CRM payload preview and stores it as
// a pending_approval job. Does NOT write to HubSpot. Any authenticated tenant
// user can prepare a sync for a lead they can access (booth_user limited to
// their own leads); only managers/tenant_admins can approve it afterward.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json() as { leadId?: string };
  const { leadId } = body;
  if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

  const conditions = [eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId)];
  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }
  const leadRows = await db.select({ id: schema.leads.id, eventId: schema.leads.eventId }).from(schema.leads).where(and(...conditions)).limit(1);
  if (!leadRows.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  try {
    const preview = await prepareCRMRecord(leadId, tenantId);

    if (!preview.allowSync) {
      await logAudit({
        tenantId, userId: session.user.id,
        action: "crm_sync_prepared",
        resourceType: "crm_sync",
        resourceId: leadId,
        metadata: { leadId, allowed: false, reason: preview.blockedReason },
      });
      return NextResponse.json({ error: preview.blockedReason, preview }, { status: 422 });
    }

    const [job] = await db.insert(schema.crmSyncJobs).values({
      tenantId,
      eventId: leadRows[0].eventId ?? null,
      leadId,
      createdByUserId: session.user.id ?? null,
      syncType: "full_sync",
      syncStatus: "pending_approval",
      syncPayload: preview as unknown as Record<string, unknown>,
    }).returning();

    await logAudit({
      tenantId, userId: session.user.id,
      action: "crm_sync_prepared",
      resourceType: "crm_sync",
      resourceId: job.id,
      metadata: { leadId, classification: preview.classification },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to prepare CRM sync";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
