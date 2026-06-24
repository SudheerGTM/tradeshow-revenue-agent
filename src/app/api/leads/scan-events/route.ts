import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const ALLOWED_TYPES = ["qr_scanned", "ocr_reviewed"] as const;

// POST /api/leads/scan-events — generic audit logging for capture-flow events
// that have no other natural server round-trip (qr_scanned, ocr_reviewed)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json();
  const { type, rawText } = body as { type: string; rawText?: string };

  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json({ error: `Unsupported event type: ${type}` }, { status: 400 });
  }

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: type,
    resourceType: "lead",
    metadata: rawText ? { rawText } : undefined,
  });

  return NextResponse.json({ success: true });
}
