import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { validateICPConfiguration, ICPValidationError } from "@/lib/icp/icp-resolver";
import { emptyICPConfig } from "@/lib/icp/schema";

// GET /api/icp-profiles — list, tenant-scoped, any authenticated tenant role
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(schema.icpProfiles)
    .where(eq(schema.icpProfiles.tenantId, session.user.tenantId))
    .orderBy(desc(schema.icpProfiles.updatedAt));

  return NextResponse.json({ items: rows });
}

// POST /api/icp-profiles — create (tenant_admin only), starts as "draft"
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, configurationJson } = body as {
    name?: string; description?: string; configurationJson?: unknown;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let config;
  try {
    config = validateICPConfiguration(configurationJson ?? emptyICPConfig());
  } catch (err) {
    if (err instanceof ICPValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const [created] = await db
    .insert(schema.icpProfiles)
    .values({
      tenantId: session.user.tenantId,
      name: name.trim(),
      description: description ?? null,
      status: "draft",
      version: 1,
      configurationJson: config,
      createdByUserId: session.user.id,
    })
    .returning();

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "icp_profile_created",
    resourceType: "icp_profile",
    resourceId: created.id,
    metadata: { name: created.name },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(created, { status: 201 });
}
