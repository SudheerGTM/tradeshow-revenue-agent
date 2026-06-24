import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAvatarS3Key, generatePresignedUploadUrl } from "@/lib/aws/s3";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// POST /api/users/me/avatar — returns a presigned upload URL for the caller's own avatar
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileType, fileSizeBytes } = (await req.json()) as { fileType: string; fileSizeBytes: number };
  if (!ALLOWED_TYPES.includes(fileType)) {
    return NextResponse.json({ error: `Unsupported file type: ${fileType}` }, { status: 400 });
  }
  if (fileSizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Image exceeds 2 MB limit" }, { status: 400 });
  }

  const s3Key = buildAvatarS3Key(session.user.id!, fileType);
  const uploadUrl = await generatePresignedUploadUrl(s3Key, fileType, fileSizeBytes);

  return NextResponse.json({ uploadUrl, s3Key });
}
