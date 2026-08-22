import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { getCampaign, getCampaignICPProfiles, setCampaignICPProfiles, ICPTenantMismatchError } from "@/lib/icp/icp-resolver";

// PATCH /api/campaigns/:id/icps — tenant_admin only. Replaces the campaign's
// full set of assigned ICP profiles (body: { icpProfileIds: string[] }).
// Every ID is tenant-ownership-validated before anything is written — a
// single cross-tenant ID rejects the whole call.
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
  const { icpProfileIds } = body as { icpProfileIds?: string[] };

  try {
    await setCampaignICPProfiles(tenantId, id, icpProfileIds ?? []);
  } catch (err) {
    if (err instanceof ICPTenantMismatchError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const icpProfiles = await getCampaignICPProfiles(tenantId, id);

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "campaign_icps_updated",
    resourceType: "campaign",
    resourceId: id,
    metadata: { icpProfileIds: icpProfiles.map((p) => p.id) },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ icpProfiles });
}
