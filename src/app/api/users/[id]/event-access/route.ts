import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin, isPlatformAdmin } from "@/lib/permissions";
import { logAudit, getRequestIp } from "@/lib/audit";
import { setEventAccess, getAccessibleEventIds } from "@/lib/event-access";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// GET /api/users/:id/event-access
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [user] = await db
    .select({ id: schema.users.id, tenantId: schema.users.tenantId, allEvents: schema.users.allEvents })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const eventIds = await getAccessibleEventIds(id, user.allEvents);
  return NextResponse.json({ allEvents: user.allEvents, eventIds: eventIds ?? [] });
}

// POST /api/users/:id/event-access — { allEvents: boolean, eventIds: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { allEvents, eventIds } = (await req.json()) as { allEvents: boolean; eventIds: string[] };

  const [target] = await db
    .select({ id: schema.users.id, tenantId: schema.users.tenantId })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isPlatformAdmin(session.user.role) && target.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await setEventAccess(id, allEvents, eventIds ?? []);

  await logAudit({
    tenantId: target.tenantId,
    userId: session.user.id,
    action: "event_access_changed",
    resourceType: "user",
    resourceId: id,
    metadata: { allEvents, eventIds },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({ success: true });
}
