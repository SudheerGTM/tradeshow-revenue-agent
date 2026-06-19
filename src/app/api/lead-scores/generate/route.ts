import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { scoreLead } from "@/lib/agents/lead-scoring";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json() as { leadId?: string };
  const { leadId } = body;
  if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

  // Verify lead access (booth_user can only score own leads)
  const conditions = [
    eq(schema.leads.id, leadId),
    eq(schema.leads.tenantId, tenantId),
  ];
  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }

  const leadRows = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(...conditions)).limit(1);
  if (!leadRows.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  try {
    const scoreRecord = await scoreLead(leadId, tenantId, session.user.id!);
    return NextResponse.json(scoreRecord, { status: 201 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Scoring failed";

    await logAudit({
      tenantId, userId: session.user.id,
      action: "lead_score_failed",
      resourceType: "lead_score",
      resourceId: leadId,
      metadata: { reason },
    });

    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
