import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ total: 0, leadsWithNotes: 0 });

  const baseFilter = and(
    eq(schema.voiceNotes.tenantId, tenantId),
    eq(schema.voiceNotes.recordingStatus, "uploaded"),
    isNull(schema.voiceNotes.deletedAt)
  );

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.voiceNotes)
    .where(baseFilter);

  const [leadsRow] = await db
    .select({ count: sql<number>`count(distinct lead_id)::int` })
    .from(schema.voiceNotes)
    .where(baseFilter);

  return NextResponse.json({
    total: totalRow?.count ?? 0,
    leadsWithNotes: leadsRow?.count ?? 0,
  });
}
