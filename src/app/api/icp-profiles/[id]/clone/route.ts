import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { getICPProfile } from "@/lib/icp/icp-resolver";

// POST /api/icp-profiles/:id/clone — tenant_admin only. Copies
// configurationJson into a new draft profile; does not copy status/version.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const source = await getICPProfile(tenantId, id);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [clone] = await db
    .insert(schema.icpProfiles)
    .values({
      tenantId,
      name: `${source.name} (Copy)`,
      description: source.description,
      status: "draft",
      version: 1,
      configurationJson: source.configurationJson,
      createdByUserId: session.user.id,
    })
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "icp_profile_cloned",
    resourceType: "icp_profile",
    resourceId: clone.id,
    metadata: { sourceProfileId: id, sourceName: source.name },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(clone, { status: 201 });
}
