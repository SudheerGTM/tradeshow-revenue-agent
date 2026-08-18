import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  TranscriptionJobStatus,
} from "@aws-sdk/client-transcribe";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION!;
const OUTPUT_BUCKET = process.env.AWS_TRANSCRIBE_OUTPUT_BUCKET!;
const OUTPUT_PREFIX = process.env.AWS_TRANSCRIBE_OUTPUT_PREFIX ?? "transcripts";
const DEFAULT_LANGUAGE = process.env.AWS_TRANSCRIBE_LANGUAGE_CODE ?? "en-GB";

let _transcribeClient: TranscribeClient | null = null;
let _s3Client: S3Client | null = null;

function resolvedCredentials() {
  return process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    : undefined; // falls back to the instance role when not set (production)
}

function getTranscribeClient(): TranscribeClient {
  if (!_transcribeClient) {
    _transcribeClient = new TranscribeClient({
      region: REGION,
      credentials: resolvedCredentials(),
    });
  }
  return _transcribeClient;
}

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: REGION,
      credentials: resolvedCredentials(),
    });
  }
  return _s3Client;
}

/**
 * Deterministic, tenant-scoped job name.
 * Transcribe job names must be unique and match [0-9a-zA-Z._-]{1,200}.
 */
export function generateTranscribeJobName(
  tenantId: string,
  voiceNoteId: string
): string {
  // Use short prefixes to stay well within the 200-char limit
  return `ts-${tenantId.slice(0, 8)}-${voiceNoteId.slice(0, 8)}-${Date.now()}`;
}

/**
 * Build the tenant-scoped S3 output key for the transcript JSON.
 * Pattern: transcripts/{tenantId}/{eventId}/{leadId}/{voiceNoteId}/transcript.json
 */
export function buildTranscriptOutputKey(params: {
  tenantId: string;
  eventId: string;
  leadId: string;
  voiceNoteId: string;
}): string {
  return `${OUTPUT_PREFIX}/${params.tenantId}/${params.eventId}/${params.leadId}/${params.voiceNoteId}/transcript.json`;
}

export interface StartJobParams {
  jobName: string;
  audioS3Bucket: string;
  audioS3Key: string;
  outputS3Key: string;
  languageCode?: string;
}

export async function startTranscriptionJob(params: StartJobParams): Promise<void> {
  const lang = params.languageCode ?? DEFAULT_LANGUAGE;

  await getTranscribeClient().send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: params.jobName,
      LanguageCode: lang as "en-GB",
      MediaFormat: detectMediaFormat(params.audioS3Key),
      Media: {
        MediaFileUri: `s3://${params.audioS3Bucket}/${params.audioS3Key}`,
      },
      OutputBucketName: OUTPUT_BUCKET,
      OutputKey: params.outputS3Key,
      Settings: {
        ShowSpeakerLabels: false,
      },
    })
  );
}

export interface TranscribeJobResult {
  status: "queued" | "in_progress" | "completed" | "failed";
  failureReason?: string;
}

export async function getTranscriptionJobStatus(
  jobName: string
): Promise<TranscribeJobResult> {
  const res = await getTranscribeClient().send(
    new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
  );

  const job = res.TranscriptionJob;
  if (!job) return { status: "failed", failureReason: "Job not found" };

  switch (job.TranscriptionJobStatus) {
    case TranscriptionJobStatus.COMPLETED:
      return { status: "completed" };
    case TranscriptionJobStatus.FAILED:
      return { status: "failed", failureReason: job.FailureReason ?? "Unknown failure" };
    case TranscriptionJobStatus.IN_PROGRESS:
      return { status: "in_progress" };
    default:
      return { status: "queued" };
  }
}

export interface ParsedTranscript {
  text: string;
  confidence: number | null;
}

export async function parseTranscriptFromS3(s3Key: string): Promise<ParsedTranscript> {
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: OUTPUT_BUCKET, Key: s3Key })
  );

  const body = await res.Body?.transformToString("utf-8");
  if (!body) throw new Error("Empty transcript response from S3");

  // Amazon Transcribe output JSON shape
  const json = JSON.parse(body) as {
    results?: {
      transcripts?: { transcript: string }[];
      items?: { alternatives?: { confidence: string }[] }[];
    };
  };

  const text = json.results?.transcripts?.[0]?.transcript ?? "";

  // Average confidence across all word items that have it
  const items = json.results?.items ?? [];
  const confidences = items
    .flatMap((item) => item.alternatives ?? [])
    .map((alt) => parseFloat(alt.confidence ?? ""))
    .filter((n) => !isNaN(n));

  const confidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;

  return { text, confidence };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function detectMediaFormat(s3Key: string): "webm" | "mp4" | "mp3" | "wav" | "ogg" {
  const ext = s3Key.split(".").pop()?.toLowerCase();
  const supported = ["webm", "mp4", "mp3", "wav", "ogg"] as const;
  return supported.includes(ext as (typeof supported)[number])
    ? (ext as (typeof supported)[number])
    : "webm";
}
