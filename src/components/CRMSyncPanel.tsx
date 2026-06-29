"use client";

import { useState, useEffect } from "react";
import {
  RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle, ExternalLink,
  Building2, User, Briefcase, ClipboardList, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type SyncStatus = "pending_approval" | "approved" | "queued" | "processing" | "completed" | "failed";

interface SyncJob {
  id: string;
  syncStatus: SyncStatus;
  hubspotContactId: string | null;
  hubspotCompanyId: string | null;
  hubspotDealId: string | null;
  hubspotTaskId: string | null;
  syncPayload: {
    classification: string | null;
    allowSync: boolean;
    blockedReason?: string;
    contact: { firstname: string; lastname?: string; email?: string; jobtitle?: string; company?: string } | null;
    company: { name: string; domain?: string; industry?: string } | null;
    deal: { dealname: string; amount?: number; dealstage: string; description: string } | null;
    task: { subject: string; body: string; dueDate: string | null } | null;
    duplicates: { contact: { id: string } | null; company: { id: string } | null };
  } | null;
  failureReason: string | null;
  createdAt: string;
}

interface Props { leadId: string; userRole: string; }

const STATUS_STYLE: Record<SyncStatus, { bg: string; text: string; label: string }> = {
  pending_approval: { bg: "#f1f5f9", text: "#64748B", label: "Pending Approval" },
  approved:         { bg: "#dbeafe", text: "#0F4C81", label: "Approved" },
  queued:           { bg: "#dbeafe", text: "#0F4C81", label: "Queued" },
  processing:       { bg: "#fef3c7", text: "#d97706", label: "Processing" },
  completed:        { bg: "#dcfce7", text: "#16A34A", label: "Completed" },
  failed:           { bg: "#fee2e2", text: "#DC2626", label: "Failed" },
};

export function CRMSyncPanel({ leadId, userRole }: Props) {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [error, setError] = useState("");
  const [hubspotConnected, setHubspotConnected] = useState(true);

  const canApprove = userRole === "manager" || userRole === "tenant_admin";
  const canRetry = userRole === "tenant_admin";

  useEffect(() => { fetchJobs(); }, [leadId]);
  useEffect(() => {
    fetch("/api/crm-sync/status")
      .then((res) => res.ok ? res.json() : { hubspotConnected: true })
      .then((data) => setHubspotConnected(data.hubspotConnected))
      .catch(() => {});
  }, []);

  async function fetchJobs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm-sync?lead_id=${leadId}`);
      if (res.ok) setJobs(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handlePrepare() {
    setPreparing(true);
    setError("");
    try {
      const res = await fetch("/api/crm-sync/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not prepare CRM sync");
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare CRM sync");
    } finally {
      setPreparing(false);
    }
  }

  async function handleApprove(jobId: string) {
    setActioning(true);
    setError("");
    try {
      const res = await fetch(`/api/crm-sync/${jobId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActioning(false);
    }
  }

  async function handleReject(jobId: string) {
    setActioning(true);
    setError("");
    try {
      const res = await fetch(`/api/crm-sync/${jobId}/reject`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Rejection failed");
      }
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setActioning(false);
    }
  }

  async function handleRetry(jobId: string) {
    setActioning(true);
    setError("");
    try {
      const res = await fetch(`/api/crm-sync/${jobId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retry failed");
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setActioning(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex justify-center shadow-sm">
        <Loader2 className="w-5 h-5 animate-spin text-[#CBD5E1]" />
      </div>
    );
  }

  const latest = jobs[0] ?? null;
  const sStyle = latest ? STATUS_STYLE[latest.syncStatus] : null;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">CRM Sync</p>
          </div>
          {latest && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: sStyle?.bg, color: sStyle?.text }}>
              {sStyle?.label}
            </span>
          )}
        </div>

        {!hubspotConnected && (
          <div className="bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626] shrink-0 mt-0.5" />
            <p className="text-xs text-[#DC2626]">
              CRM Sync is configured but HubSpot credentials are not connected in this tenant. Contact your administrator to connect HubSpot.
            </p>
          </div>
        )}

        <div className="bg-[#fef3c7] border border-[#F59E0B]/30 rounded-xl px-3 py-2">
          <p className="text-xs text-[#92400e]">
            No record is created in HubSpot until a manager or tenant admin explicitly approves this sync.
          </p>
        </div>

        {error && (
          <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* HubSpot record IDs */}
        {latest && (latest.hubspotContactId || latest.hubspotCompanyId || latest.hubspotDealId || latest.hubspotTaskId) && (
          <div className="grid grid-cols-2 gap-2">
            <RecordIdRow icon={User}          label="Contact" id={latest.hubspotContactId} />
            <RecordIdRow icon={Building2}     label="Company" id={latest.hubspotCompanyId} />
            <RecordIdRow icon={Briefcase}      label="Deal"    id={latest.hubspotDealId} />
            <RecordIdRow icon={ClipboardList} label="Task"    id={latest.hubspotTaskId} />
          </div>
        )}

        {latest?.failureReason && (
          <div className="flex items-start gap-2 bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626] shrink-0 mt-0.5" />
            <p className="text-xs text-[#DC2626]">{latest.failureReason}</p>
          </div>
        )}

        {/* Action buttons */}
        {!latest && (
          <Button onClick={handlePrepare} loading={preparing} className="w-full">
            <Sparkles className="w-4 h-4" /> Prepare CRM Sync
          </Button>
        )}

        {latest?.syncStatus === "pending_approval" && (
          <div className="space-y-2">
            {canApprove ? (
              <div className="flex gap-2">
                <Button onClick={() => handleApprove(latest.id)} loading={actioning} className="flex-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve Sync
                </Button>
                <Button onClick={() => handleReject(latest.id)} loading={actioning} variant="danger" className="flex-1">
                  <XCircle className="w-3.5 h-3.5" /> Reject Sync
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[#94A3B8] text-center">Approval requires manager or tenant admin role.</p>
            )}
          </div>
        )}

        {latest?.syncStatus === "failed" && canRetry && (
          <Button onClick={() => handleRetry(latest.id)} loading={actioning} variant="secondary" className="w-full">
            <RefreshCw className="w-4 h-4" /> Retry Sync
          </Button>
        )}

        {latest?.syncStatus === "completed" && (
          <Button onClick={handlePrepare} loading={preparing} variant="secondary" className="w-full">
            <Sparkles className="w-4 h-4" /> Prepare New Sync
          </Button>
        )}
      </div>

      {/* Payload preview */}
      {latest?.syncPayload?.allowSync === false && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#d97706]">
            <AlertTriangle className="w-4 h-4" />
            <p className="text-sm font-medium">Sync Blocked</p>
          </div>
          <p className="text-xs text-[#475569] mt-1.5">{latest.syncPayload.blockedReason}</p>
        </div>
      )}

      {latest?.syncPayload?.allowSync && (
        <div className="space-y-3">
          {latest.syncPayload.duplicates.contact && (
            <DuplicateWarning label="contact" id={latest.syncPayload.duplicates.contact.id} />
          )}
          {latest.syncPayload.duplicates.company && (
            <DuplicateWarning label="company" id={latest.syncPayload.duplicates.company.id} />
          )}

          {latest.syncPayload.contact && (
            <PayloadCard icon={User} title="Contact">
              <PayloadField label="Name" value={`${latest.syncPayload.contact.firstname} ${latest.syncPayload.contact.lastname ?? ""}`} />
              <PayloadField label="Email" value={latest.syncPayload.contact.email} />
              <PayloadField label="Job Title" value={latest.syncPayload.contact.jobtitle} />
              <PayloadField label="Company" value={latest.syncPayload.contact.company} />
            </PayloadCard>
          )}

          {latest.syncPayload.company && (
            <PayloadCard icon={Building2} title="Company">
              <PayloadField label="Name" value={latest.syncPayload.company.name} />
              <PayloadField label="Domain" value={latest.syncPayload.company.domain} />
              <PayloadField label="Industry" value={latest.syncPayload.company.industry} />
            </PayloadCard>
          )}

          {latest.syncPayload.deal && (
            <PayloadCard icon={Briefcase} title="Deal">
              <PayloadField label="Name" value={latest.syncPayload.deal.dealname} />
              <PayloadField label="Amount" value={latest.syncPayload.deal.amount != null ? `£${latest.syncPayload.deal.amount.toLocaleString("en-GB")}` : undefined} />
              <PayloadField label="Stage" value={latest.syncPayload.deal.dealstage} />
              <div className="pt-1">
                <p className="text-[10px] text-[#94A3B8] mb-1">Description</p>
                <p className="text-xs text-[#0F172A] whitespace-pre-wrap">{latest.syncPayload.deal.description}</p>
              </div>
            </PayloadCard>
          )}

          {latest.syncPayload.task && (
            <PayloadCard icon={ClipboardList} title="Task">
              <PayloadField label="Subject" value={latest.syncPayload.task.subject} />
              <PayloadField label="Due" value={latest.syncPayload.task.dueDate ? new Date(latest.syncPayload.task.dueDate).toLocaleDateString() : undefined} />
              <div className="pt-1">
                <p className="text-[10px] text-[#94A3B8] mb-1">Notes</p>
                <p className="text-xs text-[#0F172A] whitespace-pre-wrap">{latest.syncPayload.task.body}</p>
              </div>
            </PayloadCard>
          )}
        </div>
      )}
    </div>
  );
}

function RecordIdRow({ icon: Icon, label, id }: { icon: React.ComponentType<{ className?: string }>; label: string; id: string | null }) {
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-[#94A3B8]">{label}</p>
        {id ? (
          <p className="text-xs font-medium text-[#0F172A] truncate flex items-center gap-1">
            {id} <ExternalLink className="w-2.5 h-2.5 text-[#CBD5E1]" />
          </p>
        ) : (
          <p className="text-xs text-[#CBD5E1]">—</p>
        )}
      </div>
    </div>
  );
}

function DuplicateWarning({ label, id }: { label: string; id: string }) {
  return (
    <div className="flex items-center gap-2 bg-[#fef3c7] border border-[#F59E0B]/30 rounded-xl px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 text-[#d97706] shrink-0" />
      <p className="text-xs text-[#92400e]">
        Potential duplicate {label} found in HubSpot (ID: {id}). Approving will create a new record rather than linking to it — review before approving.
      </p>
    </div>
  );
}

function PayloadCard({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-[#0F4C81]" />
        <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-4 space-y-1.5">{children}</div>
    </div>
  );
}

function PayloadField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] text-[#94A3B8] w-20 shrink-0">{label}</span>
      <span className="text-xs text-[#0F172A]">{value}</span>
    </div>
  );
}
