"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { LeadHeader } from "@/components/lead-detail/LeadHeader";
import { TabNav, type TabKey } from "@/components/lead-detail/TabNav";
import { OverviewTab } from "@/components/lead-detail/OverviewTab";
import { ConversationIntelTab } from "@/components/lead-detail/ConversationIntelTab";
import { CompanyIntelTab } from "@/components/lead-detail/CompanyIntelTab";
import { ScoringTab } from "@/components/lead-detail/ScoringTab";
import { FollowUpTab } from "@/components/lead-detail/FollowUpTab";
import { OpportunityTab } from "@/components/lead-detail/OpportunityTab";
import { ActivityTimelineTab } from "@/components/lead-detail/ActivityTimelineTab";
import { VoiceFilesTab } from "@/components/lead-detail/VoiceFilesTab";
import { CRMSyncTab } from "@/components/lead-detail/CRMSyncTab";
import { ROIImpactTab } from "@/components/lead-detail/ROIImpactTab";
import { WorkflowTab } from "@/components/lead-detail/WorkflowTab";
import type { LeadScoreSummary, ConversationInsightSummary, CompanyEnrichmentSummary } from "@/components/lead-detail/types";
import type { Lead } from "@/db/schema";

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
  availableTranscriptId?: string | null;
  userRole: string;
}

interface ContactForm {
  firstName: string; lastName: string; jobTitle: string; companyName: string;
  email: string; phone: string; country: string;
}

export function LeadDetailClient({ lead, history, eventName, creatorName, availableTranscriptId, userRole }: Props) {
  const [tab, setTab] = useState<TabKey>("overview");

  // Shared workspace-level data — fetched once here so the header and the
  // Overview/Scoring/ROI tabs don't each duplicate it. Individual tabs
  // (LeadScorePanel, ConversationIntelligence, etc.) still self-manage their
  // own data for actions like Generate/Regenerate, unchanged from before.
  const [score, setScore] = useState<LeadScoreSummary | null>(null);
  const [insight, setInsight] = useState<ConversationInsightSummary | null>(null);
  const [company, setCompany] = useState<CompanyEnrichmentSummary | null>(null);
  const [contactLinkedin, setContactLinkedin] = useState<string | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    const [scoreRes, insightRes, enrichRes] = await Promise.all([
      fetch(`/api/lead-scores?lead_id=${lead.id}`),
      fetch(`/api/conversation-insights?lead_id=${lead.id}`),
      fetch(`/api/enrichment?lead_id=${lead.id}`),
    ]);
    if (scoreRes.ok) {
      const rows = await scoreRes.json();
      setScore(rows[0] ?? null);
    }
    if (insightRes.ok) {
      const rows = await insightRes.json();
      setInsight(rows[0] ?? null);
    }
    if (enrichRes.ok) {
      const data = await enrichRes.json();
      setCompany(data.company ?? null);
      setContactLinkedin(data.contact?.linkedinUrl ?? null);
    }
  }, [lead.id]);

  useEffect(() => { loadWorkspaceData(); }, [loadWorkspaceData]);

  // Notes
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savedNotes, setSavedNotes] = useState(false);
  const [localHistory, setLocalHistory] = useState(history);

  async function refreshHistory() {
    const detail = await fetch(`/api/leads/${lead.id}`);
    if (detail.ok) {
      const data = await detail.json();
      setLocalHistory(data.history);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSavingNotes(false);
    if (res.ok) {
      setSavedNotes(true);
      setTimeout(() => setSavedNotes(false), 2000);
      await refreshHistory();
    }
  }

  // Contact info edit
  const [editingContact, setEditingContact] = useState(false);
  const [contact, setContact] = useState<ContactForm>({
    firstName: lead.firstName,
    lastName: lead.lastName ?? "",
    jobTitle: lead.jobTitle ?? "",
    companyName: lead.companyName,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    country: lead.country ?? "",
  });
  const [contactError, setContactError] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  async function handleSaveContact() {
    if (!contact.firstName.trim()) { setContactError("First name is required"); return; }
    if (!contact.companyName.trim()) { setContactError("Company name is required"); return; }

    setContactError("");
    setSavingContact(true);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact),
    });
    setSavingContact(false);
    if (res.ok) {
      setEditingContact(false);
      await refreshHistory();
    } else {
      const data = await res.json().catch(() => ({}));
      setContactError(data.error ?? "Failed to save changes");
    }
  }

  function cancelEditContact() {
    setContact({
      firstName: lead.firstName,
      lastName: lead.lastName ?? "",
      jobTitle: lead.jobTitle ?? "",
      companyName: lead.companyName,
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      country: lead.country ?? "",
    });
    setContactError("");
    setEditingContact(false);
  }

  const leadExpectedRevenue = score?.expectedRevenue != null ? parseFloat(score.expectedRevenue) : null;

  return (
    <div className="space-y-5 max-w-7xl pb-32 md:pb-0">
      {/* Back link */}
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#475569] transition">
        <ArrowLeft className="w-4 h-4" /> Back to Leads
      </Link>

      <LeadHeader
        firstName={contact.firstName}
        lastName={contact.lastName}
        jobTitle={contact.jobTitle}
        companyName={contact.companyName}
        country={contact.country}
        score={score}
        onGenerateFollowUp={() => setTab("followup")}
        onCreateOpportunity={() => setTab("opportunity")}
        onPrepareCrmSync={() => setTab("crm")}
      />

      <TabNav active={tab} onChange={setTab} />

      <div>
        {tab === "overview" && (
          <OverviewTab
            score={score}
            insight={insight}
            company={company}
            contactLinkedin={contactLinkedin}
            eventName={eventName}
            creatorName={creatorName}
            source={lead.source}
            sourceLabel={SOURCE_LABELS[lead.source] ?? lead.source}
            consentGiven={lead.consentGiven}
            consentTimestamp={lead.consentTimestamp ? new Date(lead.consentTimestamp).toISOString() : null}
            createdAt={new Date(lead.createdAt).toISOString()}
            notes={notes}
            onNotesChange={setNotes}
            onSaveNotes={handleSaveNotes}
            savingNotes={savingNotes}
            savedNotes={savedNotes}
            editingContact={editingContact}
            contact={contact}
            onContactChange={setContact}
            onStartEditContact={() => setEditingContact(true)}
            onSaveContact={handleSaveContact}
            onCancelEditContact={cancelEditContact}
            savingContact={savingContact}
            contactError={contactError}
          />
        )}

        {tab === "conversation" && (
          <ConversationIntelTab
            leadId={lead.id}
            leadNotes={lead.notes}
            availableTranscriptId={availableTranscriptId ?? null}
            insight={insight}
          />
        )}

        {tab === "company" && (
          <CompanyIntelTab leadId={lead.id} userRole={userRole} company={company} score={score} />
        )}

        {tab === "scoring" && (
          <ScoringTab leadId={lead.id} score={score} />
        )}

        {tab === "followup" && (
          <FollowUpTab leadId={lead.id} userRole={userRole} insight={insight} />
        )}

        {tab === "opportunity" && (
          <OpportunityTab leadId={lead.id} userRole={userRole} />
        )}

        {tab === "activity" && (
          <ActivityTimelineTab history={localHistory} />
        )}

        {tab === "voice" && (
          <VoiceFilesTab leadId={lead.id} />
        )}

        {tab === "crm" && (
          <CRMSyncTab leadId={lead.id} userRole={userRole} />
        )}

        {tab === "roi" && (
          <ROIImpactTab eventId={lead.eventId ?? null} leadExpectedRevenue={leadExpectedRevenue} />
        )}

        {tab === "workflow" && (
          <WorkflowTab leadId={lead.id} />
        )}
      </div>
    </div>
  );
}
