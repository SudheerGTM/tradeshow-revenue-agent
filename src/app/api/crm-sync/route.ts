import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import type { CrmSyncStatus } from "@/db/schema";

// GET /api/crm-sync?lead_id=    -> history for a lead
// GET /api/crm-sync?status=     -> queue listing, tenant scoped
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("lead_id");
  const status = searchParams.get("status") as CrmSyncStatus | null;

  if (leadId) {
    if (session.user.role === "booth_user") {
      const leadRows = await db.select({ id: schema.leads.id }).from(schema.leads)
        .where(and(eq(schema.leads.id, leadId), eq(schema.leads.createdByUserId, session.user.id!))).limit(1);
      if (!leadRows.length) return NextResponse.json([], { status: 200 });
    }

    const rows = await db.select().from(schema.crmSyncJobs)
      .where(and(eq(schema.crmSyncJobs.leadId, leadId), eq(schema.crmSyncJobs.tenantId, tenantId)))
      .orderBy(desc(schema.crmSyncJobs.createdAt));

    return NextResponse.json(rows);
  }

  const conditions = [eq(schema.crmSyncJobs.tenantId, tenantId)];
  if (status) conditions.push(eq(schema.crmSyncJobs.syncStatus, status));
  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }

  const rows = await db
    .select({
      id: schema.crmSyncJobs.id,
      leadId: schema.crmSyncJobs.leadId,
      leadFirstName: schema.leads.firstName,
      leadLastName: schema.leads.lastName,
      companyName: schema.leads.companyName,
      syncType: schema.crmSyncJobs.syncType,
      syncStatus: schema.crmSyncJobs.syncStatus,
      hubspotContactId: schema.crmSyncJobs.hubspotContactId,
      hubspotCompanyId: schema.crmSyncJobs.hubspotCompanyId,
      hubspotDealId: schema.crmSyncJobs.hubspotDealId,
      hubspotTaskId: schema.crmSyncJobs.hubspotTaskId,
      approvedByUserId: schema.crmSyncJobs.approvedByUserId,
      approverName: schema.users.name,
      createdAt: schema.crmSyncJobs.createdAt,
      updatedAt: schema.crmSyncJobs.updatedAt,
    })
    .from(schema.crmSyncJobs)
    .innerJoin(schema.leads, eq(schema.crmSyncJobs.leadId, schema.leads.id))
    .leftJoin(schema.users, eq(schema.crmSyncJobs.approvedByUserId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.crmSyncJobs.createdAt));

  // Attach latest score per lead for the Score column
  const scoreRows = await db
    .selectDistinctOn([schema.leadScores.leadId], {
      leadId: schema.leadScores.leadId,
      score: schema.leadScores.score,
    })
    .from(schema.leadScores)
    .where(eq(schema.leadScores.tenantId, tenantId))
    .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt));
  const scoreMap = new Map(scoreRows.map(r => [r.leadId, parseFloat(r.score)]));

  const mapped = rows.map(r => ({
    ...r,
    score: scoreMap.get(r.leadId) ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  }));

  return NextResponse.json(mapped);
}
