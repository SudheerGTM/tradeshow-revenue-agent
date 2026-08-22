import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, desc, sql } from "drizzle-orm";

// GET /api/campaigns — list, tenant-scoped, any authenticated tenant role.
// Includes an assigned-ICP count per campaign so the admin list doesn't need
// a second round-trip.
export async function GET() {
  const session = await auth();
  if (!session || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      campaign: schema.campaigns,
      icpCount: sql<number>`count(${schema.campaignIcpProfiles.id})::int`,
    })
    .from(schema.campaigns)
    .leftJoin(schema.campaignIcpProfiles, eq(schema.campaignIcpProfiles.campaignId, schema.campaigns.id))
    .where(eq(schema.campaigns.tenantId, session.user.tenantId))
    .groupBy(schema.campaigns.id)
    .orderBy(desc(schema.campaigns.updatedAt));

  return NextResponse.json({ items: rows.map((r) => ({ ...r.campaign, icpCount: r.icpCount })) });
}

// POST /api/campaigns — create (tenant_admin only), starts as "draft".
// Does not accept ICP assignments here — use PATCH /api/campaigns/:id/icps
// after creation, same two-step pattern as ICP profile create-then-configure.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, startDate, endDate } = body as {
    name?: string; description?: string; startDate?: string | null; endDate?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(schema.campaigns)
    .values({
      tenantId: session.user.tenantId,
      name: name.trim(),
      description: description ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      status: "draft",
      createdByUserId: session.user.id,
    })
    .returning();

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "campaign_created",
    resourceType: "campaign",
    resourceId: created.id,
    metadata: { name: created.name },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ ...created, icpCount: 0 }, { status: 201 });
}
