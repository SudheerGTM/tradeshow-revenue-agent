import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logOpportunityActivity } from "@/lib/agents/opportunity-agent";
import type { OpportunityActivityType } from "@/db/schema";

// POST /api/opportunities/[id]/activities — add a manual activity (typically a note).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (session.user.role === "platform_admin") {
    return NextResponse.json({ error: "Platform admins have read-only access to opportunities" }, { status: 403 });
  }

  const { id } = await params;
  const rows = await db.select().from(schema.opportunities)
    .where(and(eq(schema.opportunities.id, id), eq(schema.opportunities.tenantId, tenantId))).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  const opportunity = rows[0];

  if (session.user.role === "booth_user" &&
      opportunity.createdByUserId !== session.user.id &&
      opportunity.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: "You can only add notes to your own opportunities" }, { status: 403 });
  }

  const body = await req.json() as { description?: string; activityType?: OpportunityActivityType };
  const description = (body.description ?? "").trim();
  if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });

  await logOpportunityActivity({
    tenantId, opportunityId: id, leadId: opportunity.leadId,
    userId: session.user.id,
    activityType: body.activityType ?? "note",
    description,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
