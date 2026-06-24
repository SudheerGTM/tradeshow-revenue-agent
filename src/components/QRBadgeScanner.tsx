"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ScannedBadgeFields {
  firstName: string;
  lastName: string;
  jobTitle: string;
  companyName: string;
  email: string;
  phone: string;
}

type ScannerState = "idle" | "camera" | "error";

interface Props {
  onScanned: (fields: ScannedBadgeFields, rawText: string) => void;
  onCancel: () => void;
}

export function QRBadgeScanner({ onScanned, onCancel }: Props) {
  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {
          throw new Error("play-failed");
        });
      }
      setState("camera");
      pollRef.current = setInterval(pollFrame, 250);
    } catch {
      setError("Camera access denied. Please allow camera access and try again.");
      setState("error");
    }
  }

  function stopCamera() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function pollFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code?.data) {
      stopCamera();
      const fields = parseBadgeText(code.data);
      onScanned(fields, code.data);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scan Badge QR</p>
        <button onClick={() => { stopCamera(); onCancel(); }} className="text-gray-500 hover:text-white transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {state === "error" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
          <Button variant="secondary" onClick={startCamera}>Try Again</Button>
        </div>
      )}

      <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {state === "camera" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2/3 aspect-square border-2 border-indigo-400 rounded-lg" />
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1.5">
        <Camera className="w-3.5 h-3.5" /> Point the camera at the attendee&apos;s badge QR code
      </p>
    </div>
  );
}

// ─── Badge text parsing ──────────────────────────────────────────────────────
// Badge QR formats vary by vendor — try vCard, MECARD, JSON, mailto/tel, URL
// query params, then fall back to raw text for manual review.

function parseBadgeText(text: string): ScannedBadgeFields {
  const empty: ScannedBadgeFields = {
    firstName: "", lastName: "", jobTitle: "", companyName: "", email: "", phone: "",
  };

  if (/^BEGIN:VCARD/i.test(text)) return parseVCard(text);
  if (/^MECARD:/i.test(text)) return parseMecard(text);

  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object") {
      return {
        firstName: str(json.firstName ?? json.first_name),
        lastName: str(json.lastName ?? json.last_name),
        jobTitle: str(json.jobTitle ?? json.title),
        companyName: str(json.companyName ?? json.company ?? json.organization),
        email: str(json.email),
        phone: str(json.phone ?? json.tel),
      };
    }
  } catch { /* not JSON */ }

  if (/^mailto:/i.test(text)) return { ...empty, email: text.replace(/^mailto:/i, "").split("?")[0] };
  if (/^tel:/i.test(text)) return { ...empty, phone: text.replace(/^tel:/i, "") };

  if (text.includes("=") && (text.startsWith("http") || text.includes("&"))) {
    try {
      const params = new URLSearchParams(text.includes("?") ? text.split("?")[1] : text);
      const fromParams = {
        firstName: str(params.get("firstName") ?? params.get("first_name")),
        lastName: str(params.get("lastName") ?? params.get("last_name")),
        jobTitle: str(params.get("jobTitle") ?? params.get("title")),
        companyName: str(params.get("company") ?? params.get("companyName")),
        email: str(params.get("email")),
        phone: str(params.get("phone")),
      };
      if (Object.values(fromParams).some(Boolean)) return fromParams;
    } catch { /* not query params */ }
  }

  // Fall back: nothing parsed, raw text left for the booth staff to read manually
  return empty;
}

function parseVCard(text: string): ScannedBadgeFields {
  const lines = text.split(/\r?\n/);
  const get = (prefix: string) =>
    lines.find((l) => l.toUpperCase().startsWith(prefix))?.split(":").slice(1).join(":").trim() ?? "";

  const n = get("N:"); // N:Last;First;;;
  const [last, first] = n.split(";");
  const fn = get("FN:"); // fallback full name

  return {
    firstName: first?.trim() || fn.split(" ")[0] || "",
    lastName: last?.trim() || fn.split(" ").slice(1).join(" ") || "",
    jobTitle: get("TITLE:"),
    companyName: get("ORG:"),
    email: get("EMAIL:") || get("EMAIL;"),
    phone: get("TEL:") || get("TEL;"),
  };
}

function parseMecard(text: string): ScannedBadgeFields {
  const body = text.replace(/^MECARD:/i, "");
  const get = (key: string) => {
    const match = body.match(new RegExp(`${key}:([^;]*);`, "i"));
    return match?.[1]?.trim() ?? "";
  };
  const name = get("N"); // MECARD uses "Last,First" convention
  const [last, first] = name.split(",");
  return {
    firstName: first?.trim() || "",
    lastName: last?.trim() || "",
    jobTitle: "",
    companyName: get("ORG"),
    email: get("EMAIL"),
    phone: get("TEL"),
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
