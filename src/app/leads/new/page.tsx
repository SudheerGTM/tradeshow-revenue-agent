"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Event } from "@/db/schema";

export default function NewLeadPage() {
  const router = useRouter();
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
    if (!res.ok) { setGlobalError((await res.json()).error ?? "Failed"); return; }
    const lead = await res.json();
    router.push(`/leads/${lead.id}`);
  }

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Capture Lead" description="Add a new contact from the show floor" />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name row */}
        <div className="grid grid-cols-2 gap-4">
          <Input label="First Name *" value={form.firstName} onChange={f("firstName")}
            placeholder="Jane" error={errors.firstName} />
          <Input label="Last Name" value={form.lastName} onChange={f("lastName")}
            placeholder="Smith" />
        </div>

        {/* Professional */}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Job Title" value={form.jobTitle} onChange={f("jobTitle")}
            placeholder="Head of Logistics" />
          <Input label="Company Name *" value={form.companyName} onChange={f("companyName")}
            placeholder="Acme Freight" error={errors.companyName} />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Email" type="email" value={form.email} onChange={f("email")}
            placeholder="jane@acme.com" error={errors.email} />
          <Input label="Phone" type="tel" value={form.phone} onChange={f("phone")}
            placeholder="+44 7700 000000" />
        </div>

        <Input label="Country" value={form.country} onChange={f("country")} placeholder="United Kingdom" />

        {/* Event + Source */}
        <div className="grid grid-cols-2 gap-4">
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
        <div className={`rounded-lg border p-4 ${errors.consent ? "border-red-700 bg-red-950/20" : "border-gray-700 bg-gray-800/50"}`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.consentGiven}
              onChange={(e) => setForm(p => ({ ...p, consentGiven: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-indigo-500"
            />
            <span className="text-sm text-gray-300">
              I consent to being contacted regarding products and services.
            </span>
          </label>
          {errors.consent && <p className="text-xs text-red-400 mt-2 ml-7">{errors.consent}</p>}
        </div>

        {globalError && (
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {globalError}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={loading}>Capture Lead</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
