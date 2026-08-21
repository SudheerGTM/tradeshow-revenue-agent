import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getICPProfile, validateICPConfiguration, ICPValidationError } from "@/lib/icp/icp-resolver";

// GET /api/icp-profiles/:id — tenant-scoped, any authenticated tenant role
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const profile = await getICPProfile(session.user.tenantId, id);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(profile);
}

// PATCH /api/icp-profiles/:id — edit (tenant_admin only). Bumps `version`
// only when configurationJson actually changes — a name/description-only
// edit does not bump it, matching the versioning design in
// docs/RELEASE-14-CONFIGURABLE-ICP.md.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await getICPProfile(tenantId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, description, configurationJson } = body as {
    name?: string; description?: string; configurationJson?: unknown;
  };

  const update: Partial<typeof schema.icpProfiles.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) update.name = name.trim();
  if (description !== undefined) update.description = description;

  let configChanged = false;
  if (configurationJson !== undefined) {
    let config;
    try {
      config = validateICPConfiguration(configurationJson);
    } catch (err) {
      if (err instanceof ICPValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    if (JSON.stringify(config) !== JSON.stringify(existing.configurationJson)) {
      update.configurationJson = config;
      update.version = existing.version + 1;
      configChanged = true;
    }
  }

  const [updated] = await db
    .update(schema.icpProfiles)
    .set(update)
    .where(and(eq(schema.icpProfiles.id, id), eq(schema.icpProfiles.tenantId, tenantId)))
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "icp_profile_updated",
    resourceType: "icp_profile",
    resourceId: id,
    metadata: { configChanged, newVersion: updated.version },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(updated);
}
