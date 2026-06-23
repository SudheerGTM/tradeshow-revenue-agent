"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Briefcase, Building2, User, Brain, Star, Mail, RefreshCw,
  Loader2, AlertTriangle, Clock, MessageSquare, Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select, Input, Textarea } from "@/components/ui/Input";

type Stage = "identified" | "qualified" | "meeting_scheduled" | "proposal_requested" | "proposal_sent" | "negotiation" | "won" | "lost";

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: "identified", label: "Identified" },
  { value: "qualified", label: "Qualified" },
  { value: "meeting_scheduled", label: "Meeting Scheduled" },
  { value: "proposal_requested", label: "Proposal Requested" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGE_OPTIONS.map(s => [s.value, s.label]));

interface DetailData {
  opportunity: {
    id: string; opportunityName: string; companyName: string; contactName: string | null;
    stage: Stage; priority: string; amount: string | null; probability: string | null;
    expectedRevenue: string | null; expectedCloseDate: string | null;
    nextStep: string | null; riskNotes: string | null; aiRecommendation: string | null;
    status: string; leadId: string; createdAt: string; ownerUserId: string | null;
  };
  lead: { firstName: string; lastName: string | null; jobTitle: string | null; email: string | null; consentGiven: boolean } | null;
  insight: { summary: string | null; painPoints: unknown; businessNeed: string | null; urgency: string } | null;
  company: { industry: string | null; employeeRange: string | null; headquarters: string | null } | null;
  score: { score: string; classification: string } | null;
  followup: { followupType: string; recommendedTiming: string; status: string } | null;
  crmJob: { syncStatus: string; hubspotDealId: string | null } | null;
  activities: { id: string; activityType: string; description: string; createdAt: string; userName: string | null }[];
  ownerName: string | null;
}

interface Props {
  opportunityId: string;
  userRole: string;
  userId: string;
  users: { id: string; name: string }[];
}

export function OpportunityDetailClient({ opportunityId, userRole, users }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const canEditFinancials = userRole === "manager" || userRole === "tenant_admin";
  const canEdit = userRole !== "platform_admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/opportunities/${opportunityId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handlePatch(body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: noteText.trim(), activityType: "note" }),
      });
      if (res.ok) {
        setNoteText("");
        await fetchData();
      }
    } finally {
      setAddingNote(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#CBD5E1]" />
      </div>
    );
  }

  const { opportunity, lead, insight, company, score, followup, crmJob, activities, ownerName } = data;
  const amount = opportunity.amount != null ? parseFloat(opportunity.amount) : null;
  const probability = opportunity.probability != null ? parseFloat(opportunity.probability) : null;
  const expectedRevenue = opportunity.expectedRevenue != null ? parseFloat(opportunity.expectedRevenue) : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start gap-4">
        <Link href="/opportunities" className="text-[#94A3B8] hover:text-[#475569] mt-0.5 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#0F172A]">{opportunity.opportunityName}</h1>
          <p className="text-sm text-[#475569] mt-0.5">
            {opportunity.contactName} · <Link href={`/leads/${opportunity.leadId}`} className="text-[#00B8D9] hover:text-[#009ab8]">View Lead</Link>
          </p>
        </div>
        <Badge variant="blue" className="text-sm px-3 py-1">{STAGE_LABEL[opportunity.stage]}</Badge>
      </div>

      {error && <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* Summary + editable fields */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-sm">
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Opportunity Summary</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Stage</label>
                <Select
                  disabled={!canEdit}
                  value={opportunity.stage}
                  onChange={(e) => handlePatch({ stage: e.target.value })}
                >
                  {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Owner</label>
                <Select
                  disabled={!canEdit || !canEditFinancials}
                  value={opportunity.ownerUserId ?? ""}
                  onChange={(e) => handlePatch({ ownerUserId: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
                {ownerName && <p className="text-[11px] text-[#94A3B8] mt-1">Currently: {ownerName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Amount (£)</label>
                <Input
                  type="number"
                  disabled={!canEdit || !canEditFinancials}
                  defaultValue={amount ?? ""}
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handlePatch({ amount: v }); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Probability (%)</label>
                <Input
                  type="number"
                  disabled={!canEdit || !canEditFinancials}
                  defaultValue={probability != null ? Math.round(probability * 100) : ""}
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handlePatch({ probability: v / 100 }); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Expected Close Date</label>
                <Input
                  type="date"
                  disabled={!canEdit}
                  defaultValue={opportunity.expectedCloseDate ?? ""}
                  onBlur={(e) => handlePatch({ expectedCloseDate: e.target.value })}
                />
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-xs text-[#94A3B8]">Expected Revenue</p>
                <p className="text-lg font-bold text-[#16A34A]">{expectedRevenue != null ? `£${expectedRevenue.toLocaleString("en-GB")}` : "—"}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">Next Step</label>
              <Textarea
                disabled={!canEdit}
                defaultValue={opportunity.nextStep ?? ""}
                onBlur={(e) => handlePatch({ nextStep: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">Risk Notes</label>
              <Textarea
                disabled={!canEdit}
                defaultValue={opportunity.riskNotes ?? ""}
                onBlur={(e) => handlePatch({ riskNotes: e.target.value })}
                rows={2}
              />
            </div>

            {opportunity.aiRecommendation && (
              <div className="bg-[#dbeafe] border border-[#0F4C81]/20 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-[#0F4C81] uppercase tracking-wider mb-1">AI Recommendation</p>
                <p className="text-xs text-[#0F4C81]">{opportunity.aiRecommendation}</p>
              </div>
            )}

            {saving && <p className="text-xs text-[#94A3B8]">Saving…</p>}
          </div>

          {/* Linked intelligence */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-[#F1F5F9] flex items-center gap-2">
              <Brain className="w-4 h-4 text-[#0F4C81]" />
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Conversation Summary</p>
            </div>
            <div className="p-5 space-y-2">
              {insight?.summary ? (
                <>
                  <p className="text-sm text-[#0F172A]">{insight.summary}</p>
                  {insight.businessNeed && <p className="text-xs text-[#475569]">Business Need: {insight.businessNeed}</p>}
                  <Badge variant={insight.urgency === "high" ? "red" : insight.urgency === "medium" ? "yellow" : "blue"}>{insight.urgency} urgency</Badge>
                </>
              ) : (
                <p className="text-xs text-[#94A3B8]">No conversation captured yet.</p>
              )}
            </div>
          </div>

          {/* Activities */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-[#F1F5F9] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#0F4C81]" />
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Activities</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-2">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note…"
                  rows={2}
                  className="flex-1"
                />
              </div>
              <Button onClick={handleAddNote} loading={addingNote} size="sm" variant="secondary">
                <Plus className="w-3.5 h-3.5" /> Add Note
              </Button>

              <div className="space-y-3 pt-2">
                {activities.length === 0 ? (
                  <p className="text-xs text-[#94A3B8]">No activity yet.</p>
                ) : activities.map(a => (
                  <div key={a.id} className="flex gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00B8D9] mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-[#0F172A]">{a.description}</p>
                      <p className="text-[11px] text-[#94A3B8]">
                        {a.userName ?? "System"} · {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3 shadow-sm">
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Linked Lead</p>
            {lead && (
              <>
                <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-[#94A3B8]" /><span className="text-sm text-[#0F172A]">{lead.firstName} {lead.lastName ?? ""}</span></div>
                {lead.jobTitle && <div className="flex items-center gap-2"><Briefcase className="w-3.5 h-3.5 text-[#94A3B8]" /><span className="text-xs text-[#475569]">{lead.jobTitle}</span></div>}
                {lead.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-[#94A3B8]" /><span className="text-xs text-[#475569]">{lead.email}</span></div>}
                <Badge variant={lead.consentGiven ? "green" : "red"}>{lead.consentGiven ? "Consent given" : "No consent"}</Badge>
              </>
            )}
          </div>

          {company && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-2 shadow-sm">
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Company Intelligence</p>
              <p className="text-xs text-[#475569]">Industry: {company.industry ?? "—"}</p>
              <p className="text-xs text-[#475569]">Size: {company.employeeRange ?? "—"}</p>
              <p className="text-xs text-[#475569]">HQ: {company.headquarters ?? "—"}</p>
            </div>
          )}

          {score && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-2 shadow-sm">
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider flex items-center gap-1.5"><Star className="w-3.5 h-3.5" /> Lead Score</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-[#0F172A]">{Math.round(parseFloat(score.score))}</span>
                <Badge variant={score.classification === "hot" ? "red" : score.classification === "warm" ? "yellow" : "blue"}>{score.classification}</Badge>
              </div>
            </div>
          )}

          {followup && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-2 shadow-sm">
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Follow-Up</p>
              <p className="text-xs text-[#475569] capitalize">{followup.followupType.replace("_", " ")} · {followup.recommendedTiming.replace("_", " ")}</p>
              <Badge variant={followup.status === "approved" ? "green" : followup.status === "rejected" ? "red" : "gray"}>{followup.status}</Badge>
            </div>
          )}

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-2 shadow-sm">
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> CRM Sync Status</p>
            {crmJob ? (
              <>
                <Badge variant={crmJob.syncStatus === "completed" ? "green" : crmJob.syncStatus === "failed" ? "red" : "gray"}>{crmJob.syncStatus.replace("_", " ")}</Badge>
                {crmJob.hubspotDealId && <p className="text-[11px] text-[#94A3B8] mt-1">Deal ID: {crmJob.hubspotDealId}</p>}
              </>
            ) : (
              <p className="text-xs text-[#94A3B8]">Not yet synced to HubSpot.</p>
            )}
          </div>

          <div className="bg-[#fef3c7] border border-[#F59E0B]/30 rounded-xl p-4 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[#d97706] shrink-0 mt-0.5" />
            <p className="text-xs text-[#92400e]">This is internal pipeline tracking only. CRM sync is a separate, explicitly-approved step.</p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#94A3B8]">
            <Clock className="w-3 h-3" /> Created {new Date(opportunity.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
