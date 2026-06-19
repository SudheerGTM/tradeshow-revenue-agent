import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id is required" }, { status: 400 });

  const scores = await db
    .select()
    .from(schema.leadScores)
    .where(and(
      eq(schema.leadScores.leadId, leadId),
      eq(schema.leadScores.tenantId, tenantId),
    ))
    .orderBy(desc(schema.leadScores.createdAt));

  return NextResponse.json(scores);
}
