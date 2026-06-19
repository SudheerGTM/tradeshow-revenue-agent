"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Square, Play, Pause, Upload,
  Trash2, Clock, CheckCircle, AlertCircle, Loader2,
  FileText, RefreshCw, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

const MAX_DURATION_SECONDS = 120; // 2 minutes

type RecorderState =
  | "idle"
  | "consent"
  | "recording"
  | "paused"
  | "preview"
  | "uploading"
  | "done"
  | "error";

type TranscribeStatus = "not_started" | "queued" | "in_progress" | "completed" | "failed";

interface VoiceNoteRow {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: string | null;
  durationSeconds: string | null;
  recordingStatus: string;
  transcriptionStatus: string;
  createdAt: string;
  playbackUrl: string;
  retentionDeleteAt: string | null;
}

interface TranscriptRow {
  id: string;
  voiceNoteId: string;
  transcribeStatus: TranscribeStatus;
  transcriptText: string | null;
  confidenceScore: number | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface Props {
  leadId: string;
  onUploaded?: () => void;
}

export function VoiceRecorder({ leadId, onUploaded }: Props) {
  const [state, setState] = useState<RecorderState>("idle");
  const [consentChecked, setConsentChecked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [uploadedNotes, setUploadedNotes] = useState<VoiceNoteRow[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
  const [autoTranscribe, setAutoTranscribe] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    fetchNotes();
    fetchTranscripts();
  }, [leadId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (elapsed >= MAX_DURATION_SECONDS && state === "recording") {
      stopRecording();
    }
  }, [elapsed, state]);

  async function fetchNotes() {
    setLoadingNotes(true);
    try {
      const res = await fetch(`/api/voice-notes?lead_id=${leadId}`);
      if (res.ok) setUploadedNotes(await res.json());
    } finally {
      setLoadingNotes(false);
    }
  }

  async function fetchTranscripts() {
    try {
      const res = await fetch(`/api/transcripts?lead_id=${leadId}`);
      if (res.ok) setTranscripts(await res.json());
    } catch { /* silent */ }
  }

  function transcriptFor(voiceNoteId: string): TranscriptRow | undefined {
    return transcripts.find(t => t.voiceNoteId === voiceNoteId);
  }

  function startTimer() {
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function requestMicAndStart() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find(
        (m) => MediaRecorder.isTypeSupported(m)
      ) ?? "audio/webm";

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = mr;
      chunks.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => {
        const recorded = new Blob(chunks.current, { type: mimeType });
        setBlob(recorded);
        setAudioUrl(URL.createObjectURL(recorded));
        setState("preview");
        streamRef.current?.getTracks().forEach(t => t.stop());
      };

      mr.start(250);
      setState("recording");
      startTimer();
    } catch {
      setError("Microphone access denied. Please allow microphone access and try again.");
      setState("idle");
    }
  }

  function stopRecording() {
    stopTimer();
    mediaRecorder.current?.stop();
  }

  function discardRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setBlob(null);
    setAudioUrl(null);
    setElapsed(0);
    setConsentChecked(false);
    setState("idle");
  }

  async function uploadRecording() {
    if (!blob) return;
    setState("uploading");
    setUploadProgress(0);
    setError("");

    const mimeType = blob.type || "audio/webm";
    const ext = mimeType.split("/")[1] ?? "webm";
    const fileName = `voice-note-${Date.now()}.${ext}`;

    try {
      const initiateRes = await fetch("/api/voice-notes/initiate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, fileName, fileType: mimeType, fileSizeBytes: blob.size, durationSeconds: elapsed }),
      });

      if (!initiateRes.ok) {
        const data = await initiateRes.json();
        throw new Error(data.error ?? "Failed to initiate upload");
      }

      const { voiceNoteId, uploadUrl } = await initiateRes.json();

      await uploadToS3(uploadUrl, blob, mimeType, (pct) => setUploadProgress(pct));

      const completeRes = await fetch("/api/voice-notes/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceNoteId }),
      });

      if (!completeRes.ok) throw new Error("Failed to confirm upload");

      setState("done");
      setBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setElapsed(0);
      setConsentChecked(false);
      await fetchNotes();
      onUploaded?.();

      // Auto-transcribe if enabled
      if (autoTranscribe) {
        await startTranscription(voiceNoteId);
        await fetchTranscripts();
      }

      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  }

  async function startTranscription(voiceNoteId: string) {
    const res = await fetch("/api/transcripts/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceNoteId }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to start transcription");
    }
    return res.json();
  }

  async function handleStartTranscription(voiceNoteId: string) {
    try {
      await startTranscription(voiceNoteId);
      await fetchTranscripts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start transcription");
    }
  }

  async function handleRefreshStatus(voiceNoteId: string) {
    try {
      const res = await fetch(`/api/transcripts/status?voice_note_id=${voiceNoteId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to check status");
      }
      await fetchTranscripts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to refresh status");
    }
  }

  async function deleteNote(id: string) {
    setDeletingId(id);
    const res = await fetch("/api/voice-notes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceNoteId: id }),
    });
    if (res.ok) await fetchNotes();
    setDeletingId(null);
  }

  const remaining = MAX_DURATION_SECONDS - elapsed;
  const isNearLimit = remaining <= 20;

  return (
    <div className="space-y-5">
      {/* ── Recorder card ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Voice Notes</p>
          {state === "recording" && (
            <span className={`flex items-center gap-1.5 text-xs font-medium ${isNearLimit ? "text-red-400" : "text-emerald-400"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {formatTime(elapsed)} / {formatTime(MAX_DURATION_SECONDS)}
            </span>
          )}
        </div>

        {/* Auto-transcribe toggle */}
        {state === "idle" && (
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div
              onClick={() => setAutoTranscribe(v => !v)}
              className={`relative w-8 h-4 rounded-full transition-colors ${autoTranscribe ? "bg-indigo-600" : "bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${autoTranscribe ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-xs text-gray-400">Auto-start transcription after upload</span>
          </label>
        )}

        {state === "idle" && (
          <Button onClick={() => setState("consent")} variant="secondary" className="w-full">
            <Mic className="w-4 h-4" /> Record Voice Note
          </Button>
        )}

        {state === "consent" && (
          <div className="space-y-4">
            <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-4">
              <p className="text-sm text-amber-300 font-medium mb-1">Recording Notice</p>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                Please confirm that the visitor has agreed for this conversation note to be
                recorded for follow-up and lead qualification purposes.
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-indigo-500"
              />
              <span className="text-sm text-gray-300">Recording consent confirmed</span>
            </label>
            <div className="flex gap-2">
              <Button onClick={requestMicAndStart} disabled={!consentChecked} className="flex-1">
                <Mic className="w-4 h-4" /> Start Recording
              </Button>
              <Button variant="secondary" onClick={() => { setState("idle"); setConsentChecked(false); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {state === "recording" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-0.5 h-10">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-indigo-500 rounded-full animate-pulse"
                  style={{ height: `${20 + Math.sin((i + elapsed) * 0.8) * 15}px`, animationDelay: `${i * 50}ms` }}
                />
              ))}
            </div>
            {isNearLimit && (
              <p className="text-xs text-red-400 text-center">Recording will stop automatically in {remaining}s</p>
            )}
            <Button onClick={stopRecording} variant="danger" className="w-full">
              <Square className="w-4 h-4" /> Stop Recording
            </Button>
          </div>
        )}

        {state === "preview" && audioUrl && (
          <div className="space-y-4">
            <audio
              ref={audioRef}
              src={audioUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
            <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
              <button
                onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()}
                className="text-indigo-400 hover:text-indigo-300 transition"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <div className="flex-1">
                <p className="text-sm text-white">Preview recording</p>
                <p className="text-xs text-gray-400">{formatTime(elapsed)} · {formatBytes(blob?.size ?? 0)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 text-center">
              Audio files are retained for 30 days and can be deleted earlier by an admin.
            </p>
            <div className="flex gap-2">
              <Button onClick={uploadRecording} className="flex-1">
                <Upload className="w-4 h-4" /> Upload Note
              </Button>
              <Button variant="secondary" onClick={discardRecording}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {state === "uploading" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              Uploading… {uploadProgress}%
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {state === "done" && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            Voice note uploaded successfully!
          </div>
        )}

        {state === "error" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
            <Button variant="secondary" onClick={discardRecording}>Try Again</Button>
          </div>
        )}

        {error && state !== "error" && (
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

      {/* ── Uploaded notes list ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Uploaded Recordings
        </div>

        {loadingNotes ? (
          <div className="px-5 py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
          </div>
        ) : uploadedNotes.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <MicOff className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No voice notes yet</p>
          </div>
        ) : (
          uploadedNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              transcript={transcriptFor(note.id)}
              onDelete={() => deleteNote(note.id)}
              deleting={deletingId === note.id}
              onStartTranscription={() => handleStartTranscription(note.id)}
              onRefreshStatus={() => handleRefreshStatus(note.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── NoteRow ─────────────────────────────────────────────────────────────────

function NoteRow({
  note, transcript, onDelete, deleting, onStartTranscription, onRefreshStatus,
}: {
  note: VoiceNoteRow;
  transcript: TranscriptRow | undefined;
  onDelete: () => void;
  deleting: boolean;
  onStartTranscription: () => void;
  onRefreshStatus: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [startingTx, setStartingTx] = useState(false);
  const [refreshingTx, setRefreshingTx] = useState(false);
  const [confirmTx, setConfirmTx] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const txStatus = transcript?.transcribeStatus;
  const canStart = !txStatus || txStatus === "failed";
  const isTerminal = txStatus === "completed" || txStatus === "failed";

  async function handleStart() {
    if (!confirmTx) { setConfirmTx(true); return; }
    setConfirmTx(false);
    setStartingTx(true);
    try { await onStartTranscription(); } finally { setStartingTx(false); }
  }

  async function handleRefresh() {
    setRefreshingTx(true);
    try { await onRefreshStatus(); } finally { setRefreshingTx(false); }
  }

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Audio row */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()}
          className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 hover:bg-indigo-600/30 transition shrink-0"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <audio
          ref={audioRef}
          src={note.playbackUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{note.fileName}</p>
          <p className="text-xs text-gray-500">
            {note.durationSeconds ? `${formatTime(Number(note.durationSeconds))} · ` : ""}
            {note.fileSizeBytes ? formatBytes(Number(note.fileSizeBytes)) : ""}
            {" · "}{new Date(note.createdAt).toLocaleDateString()}
          </p>
          {note.retentionDeleteAt && (
            <p className="text-[11px] text-gray-600 mt-0.5">
              Retained until {new Date(note.retentionDeleteAt).toLocaleDateString()}
            </p>
          )}
        </div>

        <button
          onClick={onDelete}
          disabled={deleting}
          className="text-gray-600 hover:text-red-400 transition disabled:opacity-40"
          title="Delete recording"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Transcription section */}
      <div className="border-t border-gray-800 pt-3 space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-gray-600 shrink-0" />
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Transcription</span>
          {txStatus && <TranscribeStatusBadge status={txStatus} />}
          {txStatus && !isTerminal && (
            <button
              onClick={handleRefresh}
              disabled={refreshingTx}
              className="ml-auto text-gray-500 hover:text-indigo-400 transition disabled:opacity-40"
              title="Refresh status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingTx ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {/* Confirmation warning before starting */}
        {confirmTx && (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 space-y-2">
            <p className="text-xs text-amber-300">
              This will use Amazon Transcribe credits. Continue?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleStart}
                className="text-xs px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                Yes, transcribe
              </button>
              <button
                onClick={() => setConfirmTx(false)}
                className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Start button */}
        {canStart && !confirmTx && (
          <button
            onClick={handleStart}
            disabled={startingTx || note.recordingStatus !== "uploaded"}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition disabled:opacity-40"
          >
            {startingTx
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5" />
            }
            {txStatus === "failed" ? "Retry Transcription" : "Start Transcription"}
          </button>
        )}

        {/* Completed transcript text */}
        {txStatus === "completed" && transcript?.transcriptText && (
          <div className="bg-gray-800 rounded-lg p-3 space-y-1">
            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
              {transcript.transcriptText}
            </p>
            {transcript.confidenceScore !== null && (
              <p className="text-[11px] text-gray-600">
                Confidence: {Math.round((transcript.confidenceScore ?? 0) * 100)}%
              </p>
            )}
          </div>
        )}

        {/* In-progress hint */}
        {(txStatus === "queued" || txStatus === "in_progress") && (
          <p className="text-xs text-gray-500 italic">
            Transcription in progress — click <RefreshCw className="w-3 h-3 inline" /> to check for updates.
          </p>
        )}

        {/* Failure reason */}
        {txStatus === "failed" && transcript?.failureReason && (
          <p className="text-xs text-red-400 bg-red-950/30 rounded px-2 py-1">
            {transcript.failureReason}
          </p>
        )}
      </div>
    </div>
  );
}

function TranscribeStatusBadge({ status }: { status: TranscribeStatus }) {
  const map: Record<TranscribeStatus, { label: string; cls: string }> = {
    not_started: { label: "Not started",  cls: "text-gray-500 bg-gray-800" },
    queued:      { label: "Queued",       cls: "text-yellow-400 bg-yellow-950/40" },
    in_progress: { label: "In progress",  cls: "text-blue-400 bg-blue-950/40" },
    completed:   { label: "Completed",    cls: "text-emerald-400 bg-emerald-950/40" },
    failed:      { label: "Failed",       cls: "text-red-400 bg-red-950/40" },
  };
  const { label, cls } = map[status] ?? map.not_started;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadToS3(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(blob);
  });
}
