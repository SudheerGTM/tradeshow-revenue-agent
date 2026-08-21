import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { getICPProfile, deactivateICPProfile } from "@/lib/icp/icp-resolver";

// POST /api/icp-profiles/:id/deactivate — tenant_admin only. Also clears the
// tenant's default pointer if this was the default (see
// deactivateICPProfile() in src/lib/icp/icp-resolver.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await getICPProfile(tenantId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await deactivateICPProfile(tenantId, id);

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "icp_profile_deactivated",
    resourceType: "icp_profile",
    resourceId: id,
    metadata: { name: existing.name },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(updated);
}
