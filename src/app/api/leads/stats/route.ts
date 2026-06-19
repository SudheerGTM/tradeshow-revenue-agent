import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ total: 0, byStatus: {}, byEvent: [] });

  const byStatus = await db
    .select({ status: schema.leads.status, count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(eq(schema.leads.tenantId, tenantId))
    .groupBy(schema.leads.status);

  const byEvent = await db
    .select({
      eventId: schema.leads.eventId,
      eventName: schema.events.name,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.leads)
    .leftJoin(schema.events, eq(schema.leads.eventId, schema.events.id))
    .where(eq(schema.leads.tenantId, tenantId))
    .groupBy(schema.leads.eventId, schema.events.name)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  const total = byStatus.reduce((s, r) => s + r.count, 0);
  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r.count]));

  return NextResponse.json({ total, byStatus: statusMap, byEvent });
}
