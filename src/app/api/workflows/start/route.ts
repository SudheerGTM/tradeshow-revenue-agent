import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { startWorkflow } from "@/lib/orchestrator/orchestrator";

// POST /api/workflows/start — runs the Lead Qualification Workflow for a lead.
// Any authenticated tenant user can start a workflow for a lead they can
// access (booth_user limited to their own leads) — viewing/retrying status
// has its own, more restrictive rules on the workflow detail routes.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { leadId } = (await req.json()) as { leadId?: string };
  if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

  const conditions = [eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId)];
  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }
  const leadRows = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(...conditions)).limit(1);
  if (!leadRows.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  try {
    const run = await startWorkflow(leadId, tenantId, session.user.id ?? null);
    return NextResponse.json(run, { status: 201 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to start workflow";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
