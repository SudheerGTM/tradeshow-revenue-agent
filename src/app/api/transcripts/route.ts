import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const leadId = req.nextUrl.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  // Booth users: verify they own the lead
  const role = session.user.role;
  if (role === "booth_user") {
    const lead = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.id, leadId),
          eq(schema.leads.tenantId, tenantId),
          eq(schema.leads.createdByUserId, session.user.id!)
        )
      )
      .limit(1);
    if (!lead.length) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: schema.transcripts.id,
      voiceNoteId: schema.transcripts.voiceNoteId,
      transcribeJobName: schema.transcripts.transcribeJobName,
      transcribeStatus: schema.transcripts.transcribeStatus,
      transcriptText: schema.transcripts.transcriptText,
      languageCode: schema.transcripts.languageCode,
      confidenceScore: schema.transcripts.confidenceScore,
      failureReason: schema.transcripts.failureReason,
      startedAt: schema.transcripts.startedAt,
      completedAt: schema.transcripts.completedAt,
      createdAt: schema.transcripts.createdAt,
    })
    .from(schema.transcripts)
    .where(
      and(
        eq(schema.transcripts.leadId, leadId),
        eq(schema.transcripts.tenantId, tenantId)
      )
    )
    .orderBy(schema.transcripts.createdAt);

  return NextResponse.json(rows);
}
