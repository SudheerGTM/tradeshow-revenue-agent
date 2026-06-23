"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Event } from "@/db/schema";

export default function NewLeadPage() {
  const router = useRouter();
  const toast = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState({
    firstName: "", lastName: "", jobTitle: "", companyName: "",
    email: "", phone: "", country: "",
    source: "manual", notes: "", eventId: "",
    consentGiven: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");

  useEffect(() => {
    fetch("/api/events").then(r => r.json()).then(setEvents).catch(() => {});
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setGlobalError("");
    setLoading(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, eventId: form.eventId || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const reason = (await res.json()).error ?? "Failed to capture lead";
      setGlobalError(reason);
      toast.error(reason);
      return;
    }
    const lead = await res.json();
    toast.success("Lead captured successfully");
    router.push(`/leads/${lead.id}`);
  }

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }));
  }

  return (
    <div className="max-w-2xl space-y-5 sm:space-y-6 pb-24 md:pb-0">
      <PageHeader title="Capture Lead" description="Add a new contact from the show floor" />

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
    </div>
  );
}
