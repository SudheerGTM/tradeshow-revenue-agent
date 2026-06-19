import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION!;
const BUCKET = process.env.AWS_S3_BUCKET!;
const PREFIX = process.env.AWS_S3_AUDIO_PREFIX ?? "voice-notes";

// Singleton client — instantiated once per server process
let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

/**
 * Build a deterministic, tenant-scoped S3 key.
 * Pattern: voice-notes/{tenantId}/{eventId}/{leadId}/{voiceNoteId}.{ext}
 */
export function buildS3Key(params: {
  tenantId: string;
  eventId: string;
  leadId: string;
  voiceNoteId: string;
  fileType: string; // mime type e.g. "audio/webm"
}): string {
  const ext = mimeToExt(params.fileType);
  return `${PREFIX}/${params.tenantId}/${params.eventId}/${params.leadId}/${params.voiceNoteId}.${ext}`;
}

/** Presigned PUT URL — valid for 10 minutes */
export async function generatePresignedUploadUrl(
  s3Key: string,
  fileType: string,
  fileSizeBytes: number
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         s3Key,
    ContentType: fileType,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: 600 });
}

/** Presigned GET URL — valid for 60 minutes (playback only) */
export async function generatePresignedDownloadUrl(s3Key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(getClient(), cmd, { expiresIn: 3600 });
}

/** Hard-delete from S3 (tenant_admin / manager only) */
export async function deleteAudioFile(s3Key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
}

/** Returns size and content-type without downloading the file */
export async function getAudioMetadata(
  s3Key: string
): Promise<{ size: number; contentType: string } | null> {
  try {
    const res = await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    return {
      size:        res.ContentLength ?? 0,
      contentType: res.ContentType ?? "audio/webm",
    };
  } catch {
    return null;
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm":  "webm",
    "audio/mp4":   "m4a",
    "audio/mpeg":  "mp3",
    "audio/wav":   "wav",
    "audio/ogg":   "ogg",
  };
  return map[mime] ?? "webm";
}
