"use client";

import { useState } from "react";
import { ArrowLeft, Clock, User, Building2, Mail, Phone, Globe, Tag } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import type { Lead } from "@/db/schema";

const STATUS_COLORS: Record<string, "blue" | "yellow" | "green" | "red"> = {
  new: "blue", contacted: "yellow", qualified: "green", disqualified: "red",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual Entry", qr_form: "QR Form", business_card: "Business Card",
};

interface AuditEntry {
  id: string; action: string; metadata: Record<string, unknown> | null; createdAt: string; userId: string | null;
}

interface Props {
  lead: Lead;
  history: AuditEntry[];
  eventName?: string;
  creatorName?: string;
}

export function LeadDetailClient({ lead, history, eventName, creatorName }: Props) {
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localHistory, setLocalHistory] = useState(history);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Refresh history
      const detail = await fetch(`/api/leads/${lead.id}`);
      if (detail.ok) {
        const data = await detail.json();
        setLocalHistory(data.history);
      }
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <Link href="/leads" className="text-gray-400 hover:text-white mt-0.5 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-white">
            {lead.firstName} {lead.lastName ?? ""}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{lead.jobTitle ?? ""}{lead.jobTitle && lead.companyName ? " · " : ""}{lead.companyName}</p>
        </div>
        <Badge variant={STATUS_COLORS[status] ?? "gray"} className="text-sm px-3 py-1">
          {status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contact info card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
            <div className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Contact Information
            </div>
            {[
              { icon: Building2, label: "Company",  value: lead.companyName },
              { icon: Mail,      label: "Email",    value: lead.email },
              { icon: Phone,     label: "Phone",    value: lead.phone },
              { icon: Globe,     label: "Country",  value: lead.country },
              { icon: Tag,       label: "Source",   value: SOURCE_LABELS[lead.source] ?? lead.source },
              { icon: User,      label: "Captured by", value: creatorName ?? "QR Form / Public" },
              { icon: Clock,     label: "Captured",    value: new Date(lead.createdAt).toLocaleString() },
            ].map(({ icon: Icon, label, value }) => value ? (
              <div key={label} className="px-5 py-3.5 flex items-center gap-3">
                <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
                <span className="text-sm text-white">{value}</span>
              </div>
            ) : null)}
            {eventName && (
              <div className="px-5 py-3.5 flex items-center gap-3">
                <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-xs text-gray-500 w-24 shrink-0">Event</span>
                <span className="text-sm text-white">{eventName}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this lead…"
              rows={4}
            />
          </div>

          {/* Voice Notes */}
          <VoiceRecorder leadId={lead.id} />
        </div>

        {/* Right: status + audit */}
        <div className="space-y-4">
          {/* Status update */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Update Status</p>
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof lead.status)}>
              {["new", "contacted", "qualified", "disqualified"].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </Select>
            <Button onClick={handleSave} loading={saving} className="w-full">
              {saved ? "✓ Saved" : "Save Changes"}
            </Button>
          </div>

          {/* Consent */}
          <div className={`rounded-xl border p-4 ${lead.consentGiven ? "bg-emerald-950/30 border-emerald-800" : "bg-red-950/30 border-red-800"}`}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 ${lead.consentGiven ? 'text-emerald-400' : 'text-red-400'}">
              {lead.consentGiven ? "✓ Consent Given" : "✗ No Consent"}
            </p>
            {lead.consentTimestamp && (
              <p className="text-[11px] text-gray-500">
                {new Date(lead.consentTimestamp).toLocaleString()}
              </p>
            )}
          </div>

          {/* Audit history */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Audit History</p>
            {localHistory.length === 0 ? (
              <p className="text-xs text-gray-600">No history yet.</p>
            ) : (
              <div className="space-y-2.5">
                {localHistory.map((entry) => (
                  <div key={entry.id} className="flex gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-300">{entry.action.replace(".", " ").replace("_", " ")}</p>
                      {entry.metadata && typeof entry.metadata === "object" && "to" in entry.metadata && (
                        <p className="text-[11px] text-gray-500">
                          {String((entry.metadata as { from?: string }).from ?? "")} → {String((entry.metadata as { to?: string }).to ?? "")}
                        </p>
                      )}
                      <p className="text-[11px] text-gray-600">{new Date(entry.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
