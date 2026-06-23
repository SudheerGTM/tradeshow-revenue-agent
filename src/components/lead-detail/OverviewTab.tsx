"use client";

import {
  Star, Gauge, TrendingUp, Sparkles, CheckCircle2, Building2, Mail, Phone,
  Globe, Tag, User, Clock, Link2,
} from "lucide-react";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { LeadScoreSummary, ConversationInsightSummary, CompanyEnrichmentSummary } from "./types";
import { fmtGBP } from "./types";

interface ContactForm {
  firstName: string; lastName: string; jobTitle: string; companyName: string;
  email: string; phone: string; country: string;
}

interface Props {
  score: LeadScoreSummary | null;
  insight: ConversationInsightSummary | null;
  company: CompanyEnrichmentSummary | null;
  contactLinkedin: string | null;
  eventName?: string;
  creatorName?: string;
  source: string;
  sourceLabel: string;
  consentGiven: boolean;
  consentTimestamp: string | null;
  createdAt: string;
  notes: string;
  onNotesChange: (v: string) => void;
  onSaveNotes: () => void;
  savingNotes: boolean;
  savedNotes: boolean;
  editingContact: boolean;
  contact: ContactForm;
  onContactChange: (c: ContactForm) => void;
  onStartEditContact: () => void;
  onSaveContact: () => void;
  onCancelEditContact: () => void;
  savingContact: boolean;
  contactError: string;
}

export function OverviewTab({
  score, insight, company, contactLinkedin, eventName, creatorName, sourceLabel,
  consentGiven, consentTimestamp, createdAt, notes, onNotesChange, onSaveNotes, savingNotes, savedNotes,
  editingContact, contact, onContactChange, onStartEditContact, onSaveContact, onCancelEditContact,
  savingContact, contactError,
}: Props) {
  const confidence = score?.confidenceScore ? Math.round(parseFloat(score.confidenceScore)) : null;
  const oppValue = score?.estimatedOpportunityValue != null ? parseFloat(score.estimatedOpportunityValue) : null;
  const expectedRevenue = score?.expectedRevenue != null ? parseFloat(score.expectedRevenue) : null;

  const nextActions = buildNextActions(score, insight, contactLinkedin);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi icon={Star} label="Lead Score" value={score ? `${Math.round(parseFloat(score.score))}` : "—"} color="#0F4C81" bg="#dbeafe" />
          <Kpi icon={Gauge} label="Classification" value={score ? capitalize(score.classification.replace("_", " ")) : "—"} color="#00B8D9" bg="#e6f8fc" small />
          <Kpi icon={CheckCircle2} label="Confidence" value={confidence != null ? `${confidence}%` : "—"} color="#16A34A" bg="#dcfce7" />
          <Kpi icon={TrendingUp} label="Opportunity Value" value={fmtGBP(oppValue)} color="#d97706" bg="#fef3c7" />
          <Kpi icon={TrendingUp} label="Expected Revenue" value={fmtGBP(expectedRevenue)} color="#16A34A" bg="#dcfce7" />
        </div>

        {/* AI Executive Summary */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">AI Executive Summary</p>
          </div>
          {insight?.summary || score?.scoreExplanation ? (
            <>
              <p className="text-base text-[#0F172A] leading-relaxed">
                {insight?.summary ?? score?.scoreExplanation}
              </p>
              {(score?.recommendedNextAction || insight?.nextBestAction) && (
                <div className="bg-[#dbeafe] border border-[#0F4C81]/15 rounded-xl px-4 py-3 mt-2">
                  <p className="text-[10px] font-semibold text-[#0F4C81] uppercase tracking-wider mb-1">Recommended Action</p>
                  <p className="text-sm text-[#0F4C81]">{score?.recommendedNextAction ?? insight?.nextBestAction}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[#94A3B8]">No AI summary yet — run Conversation Intelligence or Lead Scoring to generate one.</p>
          )}
        </div>

        {/* Recommended next actions */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Recommended Next Actions</p>
          {nextActions.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No recommendations yet — generate a lead score or conversation analysis.</p>
          ) : (
            <ol className="space-y-2">
              {nextActions.map((action, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#0F4C81] text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-sm text-[#0F172A] pt-0.5">{action}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Notes</p>
          <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Add notes about this lead…" rows={4} />
          <Button onClick={onSaveNotes} loading={savingNotes} size="sm">{savedNotes ? "✓ Saved" : "Save Notes"}</Button>
        </div>
      </div>

      {/* Quick Lead Details */}
      <div className="space-y-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
          <div className="px-5 py-3.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Quick Lead Details</p>
            {!editingContact && (
              <button onClick={onStartEditContact} className="text-xs text-[#00B8D9] hover:text-[#009ab8] font-medium">Edit</button>
            )}
          </div>

          {editingContact ? (
            <div className="px-5 pb-5 space-y-3">
              {contactError && <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{contactError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <Input label="First Name *" value={contact.firstName} onChange={(e) => onContactChange({ ...contact, firstName: e.target.value })} />
                <Input label="Last Name" value={contact.lastName} onChange={(e) => onContactChange({ ...contact, lastName: e.target.value })} />
              </div>
              <Input label="Job Title" value={contact.jobTitle} onChange={(e) => onContactChange({ ...contact, jobTitle: e.target.value })} />
              <Input label="Company *" value={contact.companyName} onChange={(e) => onContactChange({ ...contact, companyName: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Email" type="email" value={contact.email} onChange={(e) => onContactChange({ ...contact, email: e.target.value })} />
                <Input label="Phone" value={contact.phone} onChange={(e) => onContactChange({ ...contact, phone: e.target.value })} />
              </div>
              <Input label="Country" value={contact.country} onChange={(e) => onContactChange({ ...contact, country: e.target.value })} />
              <div className="flex gap-2 pt-1">
                <Button onClick={onSaveContact} loading={savingContact} className="flex-1">Save</Button>
                <Button onClick={onCancelEditContact} variant="secondary" className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              <Row icon={Building2} label="Company" value={contact.companyName} />
              <Row icon={Mail} label="Email" value={contact.email} />
              <Row icon={Phone} label="Phone" value={contact.phone} />
              <Row icon={Globe} label="Country" value={contact.country} />
              <Row icon={Tag} label="Source" value={sourceLabel} />
              <Row icon={User} label="Owner" value={creatorName ?? "QR Form / Public"} />
              <Row icon={Clock} label="Captured" value={new Date(createdAt).toLocaleString()} />
              {eventName && <Row icon={Clock} label="Event" value={eventName} />}
              {company?.industry && <Row icon={Building2} label="Industry" value={company.industry} />}
              {contactLinkedin && (
                <div className="px-5 py-3.5 flex items-center gap-3">
                  <Link2 className="w-4 h-4 text-[#94A3B8] shrink-0" />
                  <span className="text-xs text-[#94A3B8] w-24 shrink-0">LinkedIn</span>
                  <a href={contactLinkedin} target="_blank" rel="noopener noreferrer" className="text-sm text-[#00B8D9] hover:text-[#009ab8] truncate">View Profile</a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Consent */}
        <div className={`rounded-2xl border p-4 ${consentGiven ? "bg-[#dcfce7] border-[#16A34A]/30" : "bg-[#fee2e2] border-[#DC2626]/30"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${consentGiven ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
            {consentGiven ? "✓ Consent Given" : "✗ No Consent"}
          </p>
          {consentTimestamp && <p className="text-[11px] text-[#64748B]">{new Date(consentTimestamp).toLocaleString()}</p>}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color, bg, small }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; color: string; bg: string; small?: boolean;
}) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-3.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: bg }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <p className={`font-bold text-[#0F172A] ${small ? "text-sm" : "text-lg"} truncate`}>{value}</p>
      <p className="text-[10px] text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="px-5 py-3.5 flex items-center gap-3">
      <Icon className="w-4 h-4 text-[#94A3B8] shrink-0" />
      <span className="text-xs text-[#94A3B8] w-24 shrink-0">{label}</span>
      <span className="text-sm text-[#0F172A] truncate">{value}</span>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildNextActions(
  score: LeadScoreSummary | null,
  insight: ConversationInsightSummary | null,
  linkedinUrl: string | null
): string[] {
  const actions: string[] = [];
  if (score?.recommendedNextAction) actions.push(score.recommendedNextAction);
  if (insight?.nextBestAction && insight.nextBestAction !== score?.recommendedNextAction) actions.push(insight.nextBestAction);
  if (linkedinUrl) actions.push("Connect on LinkedIn to build rapport ahead of follow-up.");
  if (insight && (!insight.timeline || insight.timeline.toLowerCase() === "unknown")) {
    actions.push("Validate timeline — no clear timeframe captured yet.");
  }
  if (insight?.businessNeed) actions.push(`Identify current systems related to: ${insight.businessNeed}`);
  return actions.slice(0, 4);
}
