import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getCampaign, getCampaignICPProfiles } from "@/lib/icp/icp-resolver";

// GET /api/campaigns/:id — tenant-scoped, any authenticated tenant role.
// Includes the campaign's assigned ICP profiles and the events using it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await getCampaign(session.user.tenantId, id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const icpProfiles = await getCampaignICPProfiles(session.user.tenantId, id);
  const events = await db
    .select({ id: schema.events.id, name: schema.events.name })
    .from(schema.events)
    .where(and(eq(schema.events.campaignId, id), eq(schema.events.tenantId, session.user.tenantId)));

  return NextResponse.json({ ...campaign, icpProfiles, events });
}

// PATCH /api/campaigns/:id — edit (tenant_admin only). name/description/
// dates/status are all freely editable — no state-machine enforcement,
// matching the ICP profile precedent (simplest to allow any transition via
// explicit endpoints, nothing bad happens either way).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await getCampaign(tenantId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, description, startDate, endDate, status } = body as {
    name?: string; description?: string | null; startDate?: string | null; endDate?: string | null;
    status?: "draft" | "active" | "completed" | "archived";
  };

  const update: Partial<typeof schema.campaigns.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) update.name = name.trim();
  if (description !== undefined) update.description = description;
  if (startDate !== undefined) update.startDate = startDate;
  if (endDate !== undefined) update.endDate = endDate;
  if (status !== undefined) update.status = status;

  const [updated] = await db
    .update(schema.campaigns)
    .set(update)
    .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.tenantId, tenantId)))
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "campaign_updated",
    resourceType: "campaign",
    resourceId: id,
    metadata: { name: updated.name, status: updated.status },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(updated);
}
