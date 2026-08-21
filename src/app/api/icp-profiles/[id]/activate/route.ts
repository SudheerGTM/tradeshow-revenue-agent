import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getICPProfile } from "@/lib/icp/icp-resolver";

// POST /api/icp-profiles/:id/activate — tenant_admin only. A tenant may have
// multiple simultaneously-active profiles (Release 14.3 — "Active != Default",
// see docs/ICP-ARCHITECTURE.md) — activating one does not affect any other.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await getICPProfile(tenantId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(schema.icpProfiles)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(schema.icpProfiles.id, id), eq(schema.icpProfiles.tenantId, tenantId)))
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "icp_profile_activated",
    resourceType: "icp_profile",
    resourceId: id,
    metadata: { name: existing.name },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(updated);
}
