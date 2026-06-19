"use client";

import { useState, use } from "react";
import { CheckCircle } from "lucide-react";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function QRCapturePage({
  params,
}: {
  params: Promise<{ tenant: string; event: string }>;
}) {
  const { tenant, event } = use(params);

  const [form, setForm] = useState({
    firstName: "", lastName: "", jobTitle: "", companyName: "",
    email: "", phone: "", country: "", consentGiven: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [globalError, setGlobalError] = useState("");

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.companyName.trim()) e.companyName = "Required";
    if (!form.email.trim() && !form.phone.trim()) e.email = "Email or phone required";
    if (!form.consentGiven) e.consent = "Consent is required to proceed";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setGlobalError("");
    setLoading(true);
    const res = await fetch(`/api/capture/${tenant}/${event}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setGlobalError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Thank You!</h1>
          <p className="text-gray-400 text-sm">
            Your details have been received. Our team will be in touch soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">TS</span>
            </div>
            <span className="text-white font-semibold text-lg">TradeShow Agent</span>
          </div>
          <p className="text-gray-400 text-sm">Register your interest — it takes under a minute.</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name *" value={form.firstName} onChange={f("firstName")}
                placeholder="Jane" error={errors.firstName} />
              <Input label="Last Name" value={form.lastName} onChange={f("lastName")}
                placeholder="Smith" />
            </div>
            <Input label="Company *" value={form.companyName} onChange={f("companyName")}
              placeholder="Acme Freight" error={errors.companyName} />
            <Input label="Job Title" value={form.jobTitle} onChange={f("jobTitle")}
              placeholder="Head of Logistics" />
            <Input label="Email" type="email" value={form.email} onChange={f("email")}
              placeholder="jane@acme.com" error={errors.email} />
            <Input label="Phone" type="tel" value={form.phone} onChange={f("phone")}
              placeholder="+44 7700 000000" />
            <Input label="Country" value={form.country} onChange={f("country")}
              placeholder="United Kingdom" />

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
              {errors.consent && (
                <p className="text-xs text-red-400 mt-2 ml-7">{errors.consent}</p>
              )}
            </div>

            {globalError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                {globalError}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Submit My Details
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Your data is processed securely and never shared without consent.
        </p>
      </div>
    </div>
  );
}
