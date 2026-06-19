import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

// GET /api/events — scoped to caller's tenant
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.tenantId, tenantId))
    .orderBy(schema.events.startDate);

  return NextResponse.json(rows);
}

// POST /api/events — tenant_admin only
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json();
  const { name, location, startDate, endDate } = body as {
    name: string; location?: string; startDate?: string; endDate?: string;
  };

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const [event] = await db
    .insert(schema.events)
    .values({ tenantId, name, slug, location, startDate, endDate })
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "event.created",
    resourceType: "event",
    resourceId: event.id,
    metadata: { name, slug },
  });

  return NextResponse.json(event, { status: 201 });
}
