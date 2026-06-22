import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { createOpportunityFromLead } from "@/lib/agents/opportunity-agent";

// POST /api/opportunities/prepare — read-only preview of what an opportunity
// would look like for this lead. Does not persist anything. Lets the Lead
// Details "Create Opportunity" button show the payload before confirming.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json() as { leadId?: string; managerOverride?: boolean };
  const { leadId, managerOverride } = body;
  if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

  if (managerOverride && !["manager", "tenant_admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can override cold-lead opportunity creation" }, { status: 403 });
  }

  const conditions = [eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId)];
  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }
  const leadRows = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(...conditions)).limit(1);
  if (!leadRows.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  try {
    const result = await createOpportunityFromLead(leadId, tenantId, { managerOverride });
    return NextResponse.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to prepare opportunity preview";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
