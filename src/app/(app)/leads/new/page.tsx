"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { QrCode, IdCard, PencilLine, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { QRBadgeScanner, type ScannedBadgeFields } from "@/components/QRBadgeScanner";
import { BusinessCardScanner, type CardFields } from "@/components/BusinessCardScanner";
import { DuplicateLeadModal, type DuplicateMatch } from "@/components/DuplicateLeadModal";
import type { Event } from "@/db/schema";

type CaptureMode = "hub" | "manual" | "qr" | "card";

export default function NewLeadPage() {
  const router = useRouter();
  const toast = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("hub");
  const [form, setForm] = useState({
    firstName: "", lastName: "", jobTitle: "", companyName: "",
    email: "", phone: "", country: "",
    source: "manual", notes: "", eventId: "",
    consentGiven: false,
  });
  const [qrRawText, setQrRawText] = useState<string | null>(null);
  const [qrScannedAt, setQrScannedAt] = useState<string | null>(null);
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [cardMeta, setCardMeta] = useState<{ ocrRawText: string; consentConfirmed: boolean; consentTimestamp: string } | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateMatch | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const skipDuplicateCheckRef = useRef(false);

  const captureStartedAt = useRef<number>(Date.now());

  useEffect(() => {
    fetch("/api/events?accessible=true").then(r => r.json()).then(setEvents).catch(() => {});
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.companyName.trim()) e.companyName = "Required";
    if (!form.email.trim() && !form.phone.trim()) e.email = "Email or phone required";
    if (!form.consentGiven) e.consent = "Consent is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }));
  }

  function handleQrScanned(fields: ScannedBadgeFields, rawText: string) {
    fetch("/api/leads/scan-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "qr_scanned", rawText }),
    }).catch(() => {});

    setForm(p => ({
      ...p,
      firstName: fields.firstName || p.firstName,
      lastName: fields.lastName || p.lastName,
      jobTitle: fields.jobTitle || p.jobTitle,
      companyName: fields.companyName || p.companyName,
      email: fields.email || p.email,
      phone: fields.phone || p.phone,
      source: "qr_badge_scan",
      notes: fields.firstName ? p.notes : `Raw QR scan: ${rawText}`,
    }));
    setQrRawText(rawText);
    setQrScannedAt(new Date().toISOString());
    setCaptureMode("manual");
    toast.success("Badge scanned — review details below");
  }

  function handleCardAccepted(
    fields: CardFields,
    blob: Blob,
    meta: { ocrRawText: string; consentConfirmed: boolean; consentTimestamp: string }
  ) {
    setForm(p => ({
      ...p,
      firstName: fields.firstName || p.firstName,
      lastName: fields.lastName || p.lastName,
      jobTitle: fields.jobTitle || p.jobTitle,
      companyName: fields.companyName || p.companyName,
      email: fields.email || p.email,
      phone: fields.phone || p.phone,
      country: fields.country || p.country,
      source: "business_card",
    }));
    setCardBlob(blob);
    setCardMeta(meta);
    setCaptureMode("manual");
    toast.success("Business card scanned — review details below");
  }

  async function uploadBusinessCard(leadId: string) {
    if (!cardBlob || !cardMeta) return;
    const fileName = `business-card-${Date.now()}.jpg`;
    const initiateRes = await fetch("/api/business-cards/initiate-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        fileName,
        fileType: "image/jpeg",
        fileSizeBytes: cardBlob.size,
        ocrRawText: cardMeta.ocrRawText,
        extractedFieldsJson: JSON.stringify(form),
        cardConsentConfirmed: cardMeta.consentConfirmed,
      }),
    });
    if (!initiateRes.ok) return;
    const { businessCardImageId, uploadUrl } = await initiateRes.json();

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", "image/jpeg");
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject());
      xhr.onerror = () => reject();
      xhr.send(cardBlob);
    }).catch(() => {});

    await fetch("/api/business-cards/complete-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessCardImageId }),
    }).catch(() => {});
  }

  async function createLead() {
    setGlobalError("");
    setLoading(true);
    const captureDurationSeconds = Math.round((Date.now() - captureStartedAt.current) / 1000);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        eventId: form.eventId || undefined,
        qrRawText: qrRawText ?? undefined,
        qrScannedAt: qrScannedAt ?? undefined,
        captureDurationSeconds,
      }),
    });
    if (!res.ok) {
      setLoading(false);
      const reason = (await res.json()).error ?? "Failed to capture lead";
      setGlobalError(reason);
      toast.error(reason);
      return;
    }
    const lead = await res.json();

    if (cardBlob) await uploadBusinessCard(lead.id);

    setLoading(false);
    toast.success("Lead captured successfully");
    router.push(`/leads/${lead.id}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    if (!skipDuplicateCheckRef.current) {
      const params = new URLSearchParams({
        email: form.email, firstName: form.firstName, companyName: form.companyName,
      });
      const dupRes = await fetch(`/api/leads/check-duplicate?${params.toString()}`);
      if (dupRes.ok) {
        const { match } = await dupRes.json();
        if (match) {
          setDuplicateMatch(match);
          setShowDuplicateModal(true);
          return;
        }
      }
    }
    skipDuplicateCheckRef.current = false;
    await createLead();
  }

  return (
    <div className="max-w-2xl space-y-5 sm:space-y-6 pb-24 md:pb-0">
      <PageHeader title="Capture Lead" description="Add a new contact from the show floor" />

      {captureMode === "hub" && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Quick Capture</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <HubCard icon={QrCode} label="Scan Badge QR" onClick={() => setCaptureMode("qr")} />
            <HubCard icon={IdCard} label="Scan Business Card" onClick={() => setCaptureMode("card")} />
            <HubCard icon={PencilLine} label="Manual Entry" onClick={() => setCaptureMode("manual")} />
          </div>
        </div>
      )}

      {captureMode === "qr" && (
        <QRBadgeScanner onScanned={handleQrScanned} onCancel={() => setCaptureMode("hub")} />
      )}

      {captureMode === "card" && (
        <BusinessCardScanner onAccepted={handleCardAccepted} onCancel={() => setCaptureMode("hub")} />
      )}

      {captureMode === "manual" && (
        <>
          <button
            type="button"
            onClick={() => setCaptureMode("hub")}
            className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#0F172A] transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Change capture method
          </button>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Name row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="First Name *" value={form.firstName} onChange={f("firstName")}
                placeholder="Jane" error={errors.firstName} />
              <Input label="Last Name" value={form.lastName} onChange={f("lastName")}
                placeholder="Smith" />
            </div>

            {/* Professional */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Job Title" value={form.jobTitle} onChange={f("jobTitle")}
                placeholder="Head of Logistics" />
              <Input label="Company Name *" value={form.companyName} onChange={f("companyName")}
                placeholder="Acme Freight" error={errors.companyName} />
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Email" type="email" value={form.email} onChange={f("email")}
                placeholder="jane@acme.com" error={errors.email} />
              <Input label="Phone" type="tel" value={form.phone} onChange={f("phone")}
                placeholder="+44 7700 000000" />
            </div>

            <Input label="Country" value={form.country} onChange={f("country")} placeholder="United Kingdom" />

            {/* Event + Source */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Event" value={form.eventId} onChange={f("eventId")}>
                <option value="">— No event —</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </Select>
              <Select label="Lead Source" value={form.source} onChange={f("source")}>
                <option value="manual">Manual Entry</option>
                <option value="qr_form">QR Form</option>
                <option value="qr_badge_scan">QR Badge Scan</option>
                <option value="business_card">Business Card</option>
              </Select>
            </div>

            <Textarea label="Notes" value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Interested in warehouse automation solutions..." />

            {/* Consent */}
            <div className={`rounded-xl border p-4 ${errors.consent ? "border-[#DC2626] bg-[#fee2e2]" : "border-[#E2E8F0] bg-[#F8FAFC]"}`}>
              <label className="flex items-start gap-3 cursor-pointer min-h-[24px]">
                <input
                  type="checkbox"
                  checked={form.consentGiven}
                  onChange={(e) => setForm(p => ({ ...p, consentGiven: e.target.checked }))}
                  className="mt-0.5 w-5 h-5 accent-[#0F4C81] shrink-0"
                />
                <span className="text-sm text-[#0F172A]">
                  I consent to being contacted regarding products and services.
                </span>
              </label>
              {errors.consent && <p className="text-xs text-[#DC2626] mt-2 ml-8">{errors.consent}</p>}
            </div>

            {globalError && (
              <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">
                {globalError}
              </p>
            )}

            {/* Desktop/tablet submit row */}
            <div className="hidden md:flex gap-3 pt-1">
              <Button type="submit" loading={loading}>Capture Lead</Button>
              <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
            </div>

            {/* Mobile sticky submit bar */}
            <div
              className="md:hidden fixed left-0 right-0 z-30 bg-white border-t border-[#E2E8F0] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-4 py-3 flex gap-2"
              style={{ bottom: "56px", paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <Button type="button" variant="secondary" onClick={() => router.back()} className="flex-1">Cancel</Button>
              <Button type="submit" loading={loading} className="flex-1">Capture Lead</Button>
            </div>
          </form>
        </>
      )}

      <DuplicateLeadModal
        open={showDuplicateModal}
        match={duplicateMatch}
        onViewExisting={() => { if (duplicateMatch) router.push(`/leads/${duplicateMatch.id}`); }}
        onCreateAnyway={() => { skipDuplicateCheckRef.current = true; setShowDuplicateModal(false); createLead(); }}
        onCancel={() => setShowDuplicateModal(false)}
      />
    </div>
  );
}

function HubCard({ icon: Icon, label, onClick }: {
  icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6 min-h-[120px] hover:border-[#0F4C81] hover:shadow-md transition active:scale-[0.98]"
    >
      <Icon className="w-8 h-8 text-[#0F4C81]" />
      <span className="text-sm font-semibold text-[#0F172A] text-center">{label}</span>
    </button>
  );
}
