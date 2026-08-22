import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getCampaign } from "@/lib/icp/icp-resolver";

// POST /api/campaigns/:id/activate — tenant_admin only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await getCampaign(tenantId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(schema.campaigns)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.tenantId, tenantId)))
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "campaign_activated",
    resourceType: "campaign",
    resourceId: id,
    metadata: { name: existing.name },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(updated);
}
