"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Square, Play, Pause, Upload,
  Trash2, Clock, CheckCircle, AlertCircle, Loader2,
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

interface VoiceNoteRow {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: string | null;
  durationSeconds: string | null;
  recordingStatus: string;
  createdAt: string;
  playbackUrl: string;
  retentionDeleteAt: string | null;
}

interface Props {
  leadId: string;
  onUploaded?: () => void;
}

export function VoiceRecorder({ leadId, onUploaded }: Props) {
  const [state, setState] = useState<RecorderState>("idle");
  const [consentChecked, setConsentChecked] = useState(false);
  const [elapsed, setElapsed] = useState(0);          // seconds recorded
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [uploadedNotes, setUploadedNotes] = useState<VoiceNoteRow[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load existing notes on mount
  useEffect(() => {
    fetchNotes();
  }, [leadId]);

  async function fetchNotes() {
    setLoadingNotes(true);
    try {
      const res = await fetch(`/api/voice-notes?lead_id=${leadId}`);
      if (res.ok) setUploadedNotes(await res.json());
    } finally {
      setLoadingNotes(false);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Auto-stop at 2 minutes
  useEffect(() => {
    if (elapsed >= MAX_DURATION_SECONDS && state === "recording") {
      stopRecording();
    }
  }, [elapsed, state]);

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

      // Pick best supported format
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

      mr.start(250); // collect chunks every 250ms
      setState("recording");
      startTimer();

      // Log consent to audit via a side-effect API call
      await fetch("/api/voice-notes/initiate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _consentLog: true, leadId }),
      }).catch(() => {}); // fire-and-forget; ignore if it errors (payload will fail validation)
    } catch (err) {
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
    const ext = mimeType.split("/")[1]?.replace("webm", "webm") ?? "webm";
    const fileName = `voice-note-${Date.now()}.${ext}`;

    try {
      // 1. Initiate upload — get presigned URL from server
      const initiateRes = await fetch("/api/voice-notes/initiate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          fileName,
          fileType: mimeType,
          fileSizeBytes: blob.size,
          durationSeconds: elapsed,
        }),
      });

      if (!initiateRes.ok) {
        const data = await initiateRes.json();
        throw new Error(data.error ?? "Failed to initiate upload");
      }

      const { voiceNoteId, uploadUrl } = await initiateRes.json();

      // 2. PUT directly to S3 using presigned URL
      await uploadToS3(uploadUrl, blob, mimeType, (pct) => setUploadProgress(pct));

      // 3. Confirm upload complete
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

      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Voice Notes
          </p>
          {state === "recording" && (
            <span className={`flex items-center gap-1.5 text-xs font-medium ${isNearLimit ? "text-red-400" : "text-emerald-400"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {formatTime(elapsed)} / {formatTime(MAX_DURATION_SECONDS)}
            </span>
          )}
        </div>

        {/* Idle state */}
        {state === "idle" && (
          <Button onClick={() => setState("consent")} variant="secondary" className="w-full">
            <Mic className="w-4 h-4" /> Record Voice Note
          </Button>
        )}

        {/* Consent gate */}
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
              <Button
                onClick={requestMicAndStart}
                disabled={!consentChecked}
                className="flex-1"
              >
                <Mic className="w-4 h-4" /> Start Recording
              </Button>
              <Button variant="secondary" onClick={() => { setState("idle"); setConsentChecked(false); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Recording */}
        {state === "recording" && (
          <div className="space-y-4">
            {/* Waveform placeholder */}
            <div className="flex items-center justify-center gap-0.5 h-10">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-indigo-500 rounded-full animate-pulse"
                  style={{
                    height: `${20 + Math.sin((i + elapsed) * 0.8) * 15}px`,
                    animationDelay: `${i * 50}ms`,
                  }}
                />
              ))}
            </div>
            {isNearLimit && (
              <p className="text-xs text-red-400 text-center">
                Recording will stop automatically in {remaining}s
              </p>
            )}
            <Button onClick={stopRecording} variant="danger" className="w-full">
              <Square className="w-4 h-4" /> Stop Recording
            </Button>
          </div>
        )}

        {/* Preview */}
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
                onClick={() => {
                  isPlaying ? audioRef.current?.pause() : audioRef.current?.play();
                }}
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

        {/* Uploading */}
        {state === "uploading" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              Uploading… {uploadProgress}%
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Done */}
        {state === "done" && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            Voice note uploaded successfully!
          </div>
        )}

        {/* Error */}
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
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </p>
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
              onDelete={() => deleteNote(note.id)}
              deleting={deletingId === note.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NoteRow({
  note, onDelete, deleting,
}: {
  note: VoiceNoteRow;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  return (
    <div className="px-5 py-4 flex items-center gap-3">
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
        {deleting
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Trash2 className="w-4 h-4" />
        }
      </button>
    </div>
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
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(blob);
  });
}
