"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, AlertCircle, X, RotateCcw, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface CardFields {
  firstName: string;
  lastName: string;
  jobTitle: string;
  companyName: string;
  email: string;
  phone: string;
  country: string;
}

type ScannerState = "consent" | "camera" | "preview" | "extracting" | "review" | "error";

interface Props {
  onAccepted: (
    fields: CardFields,
    blob: Blob,
    meta: { ocrRawText: string; consentConfirmed: boolean; consentTimestamp: string }
  ) => void;
  onCancel: () => void;
}

export function BusinessCardScanner({ onAccepted, onCancel }: Props) {
  const [state, setState] = useState<ScannerState>("consent");
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentTimestamp, setConsentTimestamp] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fields, setFields] = useState<CardFields>({
    firstName: "", lastName: "", jobTitle: "", companyName: "", email: "", phone: "", country: "",
  });
  const [ocrRawText, setOcrRawText] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach the stream to <video> only once it's actually mounted (state === "camera").
  // Doing this in the same tick as getUserMedia — before the conditional <video> exists —
  // is a common cause of a black/frozen preview on iOS Safari.
  useEffect(() => {
    if (state !== "camera" || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {
      setError("Unable to start the camera preview. Please try again.");
      setState("error");
    });
  }, [state]);

  async function confirmConsentAndStartCamera() {
    setConsentTimestamp(new Date().toISOString());
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setState("camera");
    } catch {
      setError("Camera access denied. Please allow camera access and try again.");
      setState("error");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((b) => {
      if (!b) return;
      if (b.size > MAX_BYTES) {
        setError("Image is too large — please retake with better lighting or closer framing.");
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setBlob(b);
      setPreviewUrl(URL.createObjectURL(b));
      setState("preview");
    }, "image/jpeg", 0.9);
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setError("");
    confirmConsentAndStartCamera();
  }

  async function extract() {
    if (!blob) return;
    setState("extracting");
    setError("");
    try {
      const imageBase64 = await blobToBase64(blob);
      const res = await fetch("/api/leads/scan-business-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, fileType: "image/jpeg", fileSizeBytes: blob.size }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to extract business card details");
      }
      const data = await res.json();
      setFields(data.fields);
      setOcrRawText(data.rawText ?? "");
      setState("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setState("error");
    }
  }

  async function accept() {
    if (!blob) return;
    await fetch("/api/leads/scan-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ocr_reviewed" }),
    }).catch(() => {});
    onAccepted(fields, blob, {
      ocrRawText,
      consentConfirmed: true,
      consentTimestamp: consentTimestamp ?? new Date().toISOString(),
    });
  }

  function f(key: keyof CardFields) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setFields((p) => ({ ...p, [key]: e.target.value }));
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scan Business Card</p>
        <button onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); onCancel(); }} className="text-gray-500 hover:text-white transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {state === "consent" && (
        <div className="space-y-4">
          <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-4">
            <p className="text-sm text-amber-300 font-medium mb-1">Visitor Consent Confirmation</p>
            <p className="text-xs text-amber-200/70 leading-relaxed">
              I confirm the visitor has agreed to have their business card scanned and stored for follow-up purposes.
            </p>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-indigo-500"
            />
            <span className="text-sm text-gray-300">Consent confirmed</span>
          </label>
          <Button onClick={confirmConsentAndStartCamera} disabled={!consentChecked} className="w-full">
            <Camera className="w-4 h-4" /> Open Camera
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
          <Button variant="secondary" onClick={() => { setState("consent"); setConsentChecked(true); confirmConsentAndStartCamera(); }}>
            Try Again
          </Button>
        </div>
      )}

      {state === "camera" && (
        <div className="space-y-4">
          <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <Button onClick={capturePhoto} className="w-full">
            <Camera className="w-4 h-4" /> Capture Photo
          </Button>
          {error && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{error}</p>}
        </div>
      )}

      {state === "preview" && previewUrl && (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Captured business card" className="w-full rounded-lg" />
          <div className="flex gap-2">
            <Button onClick={extract} className="flex-1">Extract Details</Button>
            <Button variant="secondary" onClick={retake}><RotateCcw className="w-4 h-4" /> Retake</Button>
          </div>
        </div>
      )}

      {state === "extracting" && (
        <div className="flex items-center gap-2 text-sm text-gray-300 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> Extracting details…
        </div>
      )}

      {state === "review" && (
        <div className="space-y-4">
          <p className="text-sm text-white font-medium">Review Extracted Information</p>
          <p className="text-xs text-gray-500">OCR can make mistakes — check and correct before accepting.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={fields.firstName} onChange={f("firstName")} />
            <Input label="Last Name" value={fields.lastName} onChange={f("lastName")} />
          </div>
          <Input label="Job Title" value={fields.jobTitle} onChange={f("jobTitle")} />
          <Input label="Company" value={fields.companyName} onChange={f("companyName")} />
          <Input label="Email" type="email" value={fields.email} onChange={f("email")} />
          <Input label="Phone" type="tel" value={fields.phone} onChange={f("phone")} />
          <Input label="Country" value={fields.country} onChange={f("country")} />
          <div className="flex gap-2">
            <Button onClick={accept} className="flex-1"><Check className="w-4 h-4" /> Accept</Button>
            <Button variant="secondary" onClick={retake}><RotateCcw className="w-4 h-4" /> Retake Photo</Button>
            <Button variant="secondary" onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); onCancel(); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip "data:image/jpeg;base64," prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
