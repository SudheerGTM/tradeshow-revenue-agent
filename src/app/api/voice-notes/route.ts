import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { generatePresignedDownloadUrl } from "@/lib/aws/s3";
import { getLeadForVoiceNote } from "@/lib/voice-notes";

// GET /api/voice-notes?lead_id= — returns uploaded notes with presigned playback URLs
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const leadId = new URL(req.url).searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  // Verify caller can see this lead
  const lead = await getLeadForVoiceNote(leadId, tenantId, session.user.id!, session.user.role);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const notes = await db
    .select()
    .from(schema.voiceNotes)
    .where(
      and(
        eq(schema.voiceNotes.leadId, leadId),
        eq(schema.voiceNotes.tenantId, tenantId),
        eq(schema.voiceNotes.recordingStatus, "uploaded"),
        isNull(schema.voiceNotes.deletedAt)
      )
    )
    .orderBy(schema.voiceNotes.createdAt);

  // Generate fresh presigned download URLs for each note
  const notesWithUrls = await Promise.all(
    notes.map(async (n) => ({
      ...n,
      playbackUrl: await generatePresignedDownloadUrl(n.s3Key),
    }))
  );

  return NextResponse.json(notesWithUrls);
}
