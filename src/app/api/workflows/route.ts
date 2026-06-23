import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import type { WorkflowStatus } from "@/db/schema";

// GET /api/workflows?lead_id=    -> history for one lead
// GET /api/workflows?status=     -> queue listing, tenant scoped
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("lead_id");
  const status = searchParams.get("status") as WorkflowStatus | null;

  if (leadId) {
    if (session.user.role === "booth_user") {
      const [own] = await db.select({ id: schema.leads.id }).from(schema.leads)
        .where(and(eq(schema.leads.id, leadId), eq(schema.leads.createdByUserId, session.user.id!))).limit(1);
      if (!own) return NextResponse.json([], { status: 200 });
    }
    const rows = await db.select().from(schema.workflowRuns)
      .where(and(eq(schema.workflowRuns.leadId, leadId), eq(schema.workflowRuns.tenantId, tenantId)))
      .orderBy(desc(schema.workflowRuns.createdAt));
    return NextResponse.json(rows);
  }

  const conditions = [eq(schema.workflowRuns.tenantId, tenantId)];
  if (status) conditions.push(eq(schema.workflowRuns.status, status));
  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }

  const rows = await db
    .select({
      id: schema.workflowRuns.id,
      leadId: schema.workflowRuns.leadId,
      leadFirstName: schema.leads.firstName,
      leadLastName: schema.leads.lastName,
      companyName: schema.leads.companyName,
      workflowName: schema.workflowRuns.workflowName,
      status: schema.workflowRuns.status,
      currentStep: schema.workflowRuns.currentStep,
      totalSteps: schema.workflowRuns.totalSteps,
      startedAt: schema.workflowRuns.startedAt,
      completedAt: schema.workflowRuns.completedAt,
      createdAt: schema.workflowRuns.createdAt,
    })
    .from(schema.workflowRuns)
    .innerJoin(schema.leads, eq(schema.workflowRuns.leadId, schema.leads.id))
    .where(and(...conditions))
    .orderBy(desc(schema.workflowRuns.createdAt))
    .limit(100);

  const mapped = rows.map((r) => ({
    ...r,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    durationMs: r.startedAt && r.completedAt ? r.completedAt.getTime() - r.startedAt.getTime() : null,
  }));

  return NextResponse.json(mapped);
}
