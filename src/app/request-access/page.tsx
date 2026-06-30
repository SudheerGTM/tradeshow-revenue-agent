"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import {
  Loader2, Building2, User, Mail, Phone, Globe, Calendar,
  Users, Briefcase, FileText, ChevronRight, CheckCircle2, Zap, BarChart3, RefreshCw,
} from "lucide-react";

const CRM_OPTIONS = [
  "HubSpot", "Salesforce", "Pipedrive", "Zoho CRM", "Microsoft Dynamics",
  "Freshsales", "ActiveCampaign", "Other", "Not using a CRM yet",
];

const COUNTRY_OPTIONS = [
  "United Kingdom", "United States", "Canada", "Australia", "Germany",
  "France", "Netherlands", "Singapore", "India", "Other",
];

export default function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    companyName: "",
    companyWebsite: "",
    contactName: "",
    contactEmail: "",
    phone: "",
    country: "",
    eventName: "",
    expectedUsers: "",
    crmSystem: "",
    useCase: "",
    message: "",
    // Honeypot — hidden from real users
    _hp: "",
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          expectedUsers: form.expectedUsers ? parseInt(form.expectedUsers, 10) : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Request received!</h1>
          <p className="text-sm text-slate-500 mb-6">
            Thank you for your interest in Trade Show Revenue Agent. We&apos;ve received your request for{" "}
            <strong>{form.companyName}</strong> and will be in touch shortly.
          </p>
          <p className="text-xs text-slate-400">
            Check your inbox at <strong>{form.contactEmail}</strong> for a confirmation.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 mt-6 text-sm text-[#0F4C81] hover:underline font-medium"
          >
            Return to homepage <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/GTM_AI_logo.jpeg" alt="GTM Tech Sol" className="h-10 w-auto object-contain" />
            <div className="leading-tight">
              <p className="text-slate-900 font-bold text-sm">Trade Show</p>
              <p className="text-slate-500 text-sm -mt-0.5">Revenue Agent</p>
            </div>
          </div>
          <Link href="/login" className="text-sm text-[#0F4C81] hover:underline font-medium">
            Already have an account? Sign in
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left — value prop */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <span className="inline-flex items-center rounded-md bg-sky-100 text-sky-700 text-[10px] font-semibold tracking-wide px-2.5 py-1 mb-3">
                AI-POWERED REVENUE PLATFORM
              </span>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">
                Request access to Trade Show Revenue Agent
              </h1>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Capture booth leads in seconds, enrich with AI, score them, follow up automatically, and sync to your CRM. Measure real event ROI.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { icon: Zap, title: "Instant lead capture", desc: "QR codes, business card scan, voice notes" },
                { icon: BarChart3, title: "AI lead scoring", desc: "Automatically rank and prioritise leads" },
                { icon: RefreshCw, title: "CRM sync", desc: "Push hot leads to HubSpot with one click" },
                { icon: Users, title: "Team collaboration", desc: "Multi-user, role-based access control" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 text-[#0F4C81] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — form */}
          <div className="lg:col-span-3">
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">Your details</h2>
                <p className="text-xs text-slate-500 mt-0.5">All fields marked * are required.</p>
              </div>

              {/* Honeypot — invisible to real users, visible to bots */}
              <input
                type="text"
                name="_hp"
                value={form._hp}
                onChange={set("_hp")}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Company name *" icon={Building2}>
                  <input
                    required
                    minLength={2}
                    maxLength={255}
                    placeholder="Acme Ltd."
                    value={form.companyName}
                    onChange={set("companyName")}
                    className={inputClass}
                  />
                </Field>
                <Field label="Company website" icon={Globe}>
                  <input
                    type="url"
                    maxLength={255}
                    placeholder="https://acme.com"
                    value={form.companyWebsite}
                    onChange={set("companyWebsite")}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Your full name *" icon={User}>
                  <input
                    required
                    minLength={2}
                    maxLength={255}
                    placeholder="Jane Smith"
                    value={form.contactName}
                    onChange={set("contactName")}
                    className={inputClass}
                  />
                </Field>
                <Field label="Work email *" icon={Mail}>
                  <input
                    required
                    type="email"
                    maxLength={255}
                    placeholder="jane@acme.com"
                    value={form.contactEmail}
                    onChange={set("contactEmail")}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Phone" icon={Phone}>
                  <input
                    type="tel"
                    maxLength={50}
                    placeholder="+44 7700 900000"
                    value={form.phone}
                    onChange={set("phone")}
                    className={inputClass}
                  />
                </Field>
                <Field label="Country" icon={Globe}>
                  <select value={form.country} onChange={set("country")} className={inputClass}>
                    <option value="">Select country…</option>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">About your event</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Upcoming event name" icon={Calendar}>
                    <input
                      maxLength={255}
                      placeholder="Trade Show 2026"
                      value={form.eventName}
                      onChange={set("eventName")}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Expected users" icon={Users}>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      placeholder="5"
                      value={form.expectedUsers}
                      onChange={set("expectedUsers")}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="Current CRM system" icon={Briefcase}>
                    <select value={form.crmSystem} onChange={set("crmSystem")} className={inputClass}>
                      <option value="">Select CRM…</option>
                      {CRM_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-4">
                <Field label="How do you plan to use Trade Show Revenue Agent?" icon={FileText}>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    placeholder="Describe your main use case or goals…"
                    value={form.useCase}
                    onChange={set("useCase")}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
                <Field label="Anything else you'd like us to know?" icon={FileText}>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="Additional context (optional)"
                    value={form.message}
                    onChange={set("message")}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0F4C81] hover:bg-[#0a3660] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <>Request Access <ChevronRight className="w-4 h-4" /></>}
              </button>

              <p className="text-center text-xs text-slate-400">
                By submitting, you agree to our privacy policy. We&apos;ll only use your details to process your request.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/30 focus:border-[#0F4C81] transition";

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1">
        <Icon className="w-3 h-3 text-slate-400" />
        {label}
      </label>
      {children}
    </div>
  );
}
