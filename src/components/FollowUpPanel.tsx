"use client";

import { useState, useEffect } from "react";
import {
  Mail, Link2, CalendarClock, Phone, Loader2, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type FollowupType = "email" | "linkedin" | "meeting_request" | "phone_call";
type Priority = "high" | "medium" | "low";
type Timing = "immediate" | "24_hours" | "3_days" | "1_week" | "2_weeks";
type Status = "draft" | "approved" | "rejected";

interface FollowupRecord {
  id: string;
  followupType: FollowupType;
  priority: Priority;
  recommendedTiming: Timing;
  subjectLine: string | null;
  messageContent: string | null;
  callToAction: string | null;
  reasoning: string | null;
  personalizationPoints: unknown;
  confidenceScore: string | null;
  needsHumanReview: boolean;
  status: Status;
  modelUsed: string | null;
  createdAt: string;
}

interface Props {
  leadId: string;
  userRole: string;
}

const TYPE_META: Record<FollowupType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  email:            { label: "Email",           icon: Mail },
  linkedin:         { label: "LinkedIn Message", icon: Link2 },
  meeting_request:  { label: "Meeting Request",  icon: CalendarClock },
  phone_call:       { label: "Phone Call Script", icon: Phone },
};

const PRIORITY_STYLE: Record<Priority, { bg: string; text: string }> = {
  high:   { bg: "#fee2e2", text: "#DC2626" },
  medium: { bg: "#fef3c7", text: "#d97706" },
  low:    { bg: "#dbeafe", text: "#0F4C81" },
};

const TIMING_LABEL: Record<Timing, string> = {
  immediate: "Immediate", "24_hours": "Within 24 Hours", "3_days": "Within 3 Days",
  "1_week": "Within 1 Week", "2_weeks": "Within 2 Weeks",
};

const STATUS_STYLE: Record<Status, { bg: string; text: string; label: string }> = {
  draft:    { bg: "#f1f5f9", text: "#64748B", label: "Draft" },
  approved: { bg: "#dcfce7", text: "#16A34A", label: "Approved" },
  rejected: { bg: "#fee2e2", text: "#DC2626", label: "Rejected" },
};

export function FollowUpPanel({ leadId, userRole }: Props) {
  const [drafts, setDrafts] = useState<FollowupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const canApprove = userRole === "manager" || userRole === "tenant_admin";

  useEffect(() => { fetchDrafts(); }, [leadId]);

  async function fetchDrafts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/followups?lead_id=${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setDrafts(data);
        if (data.length && !expandedId) setExpandedId(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate(regenerate = false) {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/followups/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, regenerate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Follow-up generation failed");
      await fetchDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow-up generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAction(id: string, status: "approved" | "rejected") {
    setActioning(id);
    try {
      const res = await fetch(`/api/followups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await fetchDrafts();
    } finally {
      setActioning(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex justify-center shadow-sm">
        <Loader2 className="w-5 h-5 animate-spin text-[#CBD5E1]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">
              Follow-Up Intelligence
            </p>
          </div>
          {drafts.length > 0 && (
            <button onClick={fetchDrafts} className="text-[#CBD5E1] hover:text-[#94A3B8] transition">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="bg-[#fef3c7] border border-[#F59E0B]/30 rounded-xl px-3 py-2">
          <p className="text-xs text-[#92400e]">
            These are AI-generated drafts only. No emails are sent, no LinkedIn messages are posted, and no meetings are scheduled. Human approval is always required before any outreach.
          </p>
        </div>

        {error && (
          <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <Button
          onClick={() => handleGenerate(drafts.length > 0)}
          loading={generating}
          variant={drafts.length > 0 ? "secondary" : "primary"}
          className="w-full"
        >
          <Sparkles className="w-4 h-4" />
          {drafts.length > 0 ? "Regenerate Draft" : "Generate Follow-Up"}
        </Button>
      </div>

      {drafts.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center shadow-sm">
          <Mail className="w-10 h-10 text-[#E2E8F0] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0F172A] mb-1">No Follow-Up Drafts Yet</p>
          <p className="text-xs text-[#94A3B8]">Generate drafts based on this lead&apos;s score and conversation intelligence.</p>
        </div>
      ) : (
        drafts.map(draft => (
          <FollowUpCard
            key={draft.id}
            draft={draft}
            expanded={expandedId === draft.id}
            onToggle={() => setExpandedId(expandedId === draft.id ? null : draft.id)}
            canApprove={canApprove}
            onApprove={() => handleAction(draft.id, "approved")}
            onReject={() => handleAction(draft.id, "rejected")}
            actioning={actioning === draft.id}
          />
        ))
      )}
    </div>
  );
}

function FollowUpCard({
  draft, expanded, onToggle, canApprove, onApprove, onReject, actioning,
}: {
  draft: FollowupRecord; expanded: boolean; onToggle: () => void;
  canApprove: boolean; onApprove: () => void; onReject: () => void; actioning: boolean;
}) {
  const meta = TYPE_META[draft.followupType];
  const pStyle = PRIORITY_STYLE[draft.priority];
  const sStyle = STATUS_STYLE[draft.status];
  const confidence = draft.confidenceScore ? Math.round(parseFloat(draft.confidenceScore)) : null;
  const personalization = toArray(draft.personalizationPoints);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
      <button onClick={onToggle} className="w-full text-left px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#e6f8fc] flex items-center justify-center shrink-0">
            <meta.icon className="w-4 h-4 text-[#00B8D9]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-[#0F172A]">{meta.label}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg" style={{ background: pStyle.bg, color: pStyle.text }}>
                {draft.priority.toUpperCase()}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-lg" style={{ background: sStyle.bg, color: sStyle.text }}>
                {sStyle.label}
              </span>
              {draft.needsHumanReview && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-[#d97706]">
                  <AlertTriangle className="w-3 h-3" /> Needs Review
                </span>
              )}
            </div>
            <p className="text-xs text-[#94A3B8]">
              Timing: {TIMING_LABEL[draft.recommendedTiming]} · {new Date(draft.createdAt).toLocaleString()}
            </p>
            {draft.subjectLine && !expanded && (
              <p className="text-xs text-[#475569] mt-1 truncate">&ldquo;{draft.subjectLine}&rdquo;</p>
            )}
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-[#94A3B8] shrink-0 mt-1" />
            : <ChevronDown className="w-4 h-4 text-[#94A3B8] shrink-0 mt-1" />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-[#F1F5F9] pt-4">
          {draft.subjectLine && (
            <div>
              <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wider mb-1">Subject Line</p>
              <p className="text-sm font-medium text-[#0F172A]">{draft.subjectLine}</p>
            </div>
          )}

          {draft.messageContent && (
            <div>
              <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wider mb-1.5">Draft Content</p>
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5">
                <p className="text-sm text-[#0F172A] whitespace-pre-wrap leading-relaxed">{draft.messageContent}</p>
              </div>
            </div>
          )}

          {draft.callToAction && (
            <div className="bg-[#dbeafe] border border-[#0F4C81]/20 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-[#0F4C81] uppercase tracking-wider mb-1">Call to Action</p>
              <p className="text-xs text-[#0F4C81]">{draft.callToAction}</p>
            </div>
          )}

          {personalization.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wider mb-1.5">Personalization Points</p>
              <div className="flex flex-wrap gap-1.5">
                {personalization.map((p, i) => (
                  <span key={i} className="text-xs bg-[#e6f8fc] border border-[#00B8D9]/30 text-[#0F4C81] px-2 py-0.5 rounded-lg">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {draft.reasoning && (
            <div>
              <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wider mb-1">Reasoning</p>
              <p className="text-xs text-[#475569]">{draft.reasoning}</p>
            </div>
          )}

          {draft.needsHumanReview && (
            <div className="flex items-center gap-2 bg-[#fef3c7] border border-[#F59E0B]/30 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-[#d97706] shrink-0" />
              <p className="text-xs text-[#92400e]">Low confidence — please review and edit this draft before using it.</p>
            </div>
          )}

          <p className="text-[11px] text-[#94A3B8]">
            Generated by: {draft.modelUsed ?? "deterministic"} · {new Date(draft.createdAt).toLocaleString()}
            {confidence !== null && ` · ${confidence}% confidence`}
          </p>

          {/* Approve / Reject */}
          {draft.status === "draft" && (
            canApprove ? (
              <div className="flex gap-2 pt-1">
                <Button onClick={onApprove} loading={actioning} variant="primary" size="sm" className="flex-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve Draft
                </Button>
                <Button onClick={onReject} loading={actioning} variant="danger" size="sm" className="flex-1">
                  <XCircle className="w-3.5 h-3.5" /> Reject Draft
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[#94A3B8] text-center pt-1">Approval requires manager or tenant admin role.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}
