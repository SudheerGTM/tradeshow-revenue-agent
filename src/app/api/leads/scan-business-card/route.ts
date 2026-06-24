import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { extractBusinessCard } from "@/lib/ai/provider";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// POST /api/leads/scan-business-card — stateless OCR extraction, no DB write
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json();
  const { imageBase64, fileType, fileSizeBytes } = body as {
    imageBase64: string;
    fileType: string;
    fileSizeBytes: number;
  };

  if (!imageBase64 || !fileType) {
    return NextResponse.json({ error: "imageBase64, fileType required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(fileType)) {
    return NextResponse.json({ error: `Unsupported file type: ${fileType}` }, { status: 400 });
  }
  if (fileSizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Image exceeds 5 MB limit" }, { status: 400 });
  }

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "business_card_scanned",
    resourceType: "lead",
    metadata: { fileType, fileSizeBytes },
  });

  try {
    const { fields, rawText } = await extractBusinessCard(imageBase64, fileType);

    await logAudit({
      tenantId,
      userId: session.user.id,
      action: "ocr_completed",
      resourceType: "lead",
      metadata: { fields },
    });

    return NextResponse.json({ fields, rawText });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OCR extraction failed" },
      { status: 422 }
    );
  }
}
