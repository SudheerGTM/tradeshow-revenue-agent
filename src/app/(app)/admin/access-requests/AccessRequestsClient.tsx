"use client";

import { useState } from "react";
import {
  Building2, Mail, Phone, Globe, Calendar, Users, Briefcase,
  CheckCircle2, XCircle, Eye, Loader2, AlertTriangle, ExternalLink,
  Clock, RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import type { TenantAccessRequest, AccessRequestStatus } from "@/db/schema";

const STATUS_CONFIG: Record<AccessRequestStatus, { label: string; bg: string; text: string }> = {
  requested:    { label: "Requested",    bg: "#f1f5f9", text: "#64748B" },
  under_review: { label: "Under Review", bg: "#dbeafe", text: "#0F4C81" },
  approved:     { label: "Approved",     bg: "#dcfce7", text: "#16A34A" },
  rejected:     { label: "Rejected",     bg: "#fee2e2", text: "#DC2626" },
  provisioned:  { label: "Provisioned",  bg: "#f0fdf4", text: "#15803d" },
};

const STATUS_TABS: Array<{ value: AccessRequestStatus | "all"; label: string }> = [
  { value: "all",          label: "All" },
  { value: "requested",    label: "Requested" },
  { value: "under_review", label: "Under Review" },
  { value: "approved",     label: "Approved" },
  { value: "rejected",     label: "Rejected" },
  { value: "provisioned",  label: "Provisioned" },
];

interface ProvisionResult {
  tenantId: string;
  tenantSlug: string;
  emailWarning: string | null;
  wasAlreadyProvisioned: boolean;
}

export function AccessRequestsClient({ initial }: { initial: TenantAccessRequest[] }) {
  const [requests, setRequests] = useState<TenantAccessRequest[]>(initial);
  const [statusFilter, setStatusFilter] = useState<AccessRequestStatus | "all">("all");
  const [selected, setSelected] = useState<TenantAccessRequest | null>(null);
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState("");
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [sendRejectEmail, setSendRejectEmail] = useState(false);

  const filtered = statusFilter === "all"
    ? requests
    : requests.filter((r) => r.status === statusFilter);

  function updateRequest(updated: TenantAccessRequest) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  async function handleMarkUnderReview(req: TenantAccessRequest) {
    setActioning(true); setActionError("");
    const res = await fetch(`/api/access-requests/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "under_review" }),
    });
    if (res.ok) updateRequest(await res.json());
    else setActionError("Failed to update status.");
    setActioning(false);
  }

  async function handleApprove(req: TenantAccessRequest) {
    setActioning(true); setActionError("");
    const res = await fetch(`/api/access-requests/${req.id}/approve`, { method: "POST" });
    if (res.ok) updateRequest(await res.json());
    else setActionError((await res.json()).error ?? "Approval failed.");
    setActioning(false);
  }

  async function handleProvision(req: TenantAccessRequest) {
    setActioning(true); setActionError(""); setProvisionResult(null);
    const res = await fetch(`/api/access-requests/${req.id}/provision`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setProvisionResult(data);
      // Refresh the request row
      const rowRes = await fetch(`/api/access-requests/${req.id}`);
      if (rowRes.ok) updateRequest(await rowRes.json());
    } else {
      setActionError(data.error ?? "Provisioning failed.");
    }
    setActioning(false);
  }

  async function handleReject(req: TenantAccessRequest) {
    setActioning(true); setActionError("");
    const res = await fetch(`/api/access-requests/${req.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason: rejectReason || undefined, sendEmail: sendRejectEmail }),
    });
    if (res.ok) {
      updateRequest(await res.json());
      setShowRejectModal(false);
      setRejectReason("");
      setSendRejectEmail(false);
    } else {
      setActionError((await res.json()).error ?? "Rejection failed.");
    }
    setActioning(false);
  }

  async function handleSaveNotes(req: TenantAccessRequest, notes: string) {
    await fetch(`/api/access-requests/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminNotes: notes }),
    });
  }

  const counts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access Requests"
        description="Review and provision new tenant workspaces"
      />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.filter((t) => t.value !== "all").map((t) => {
          const cfg = STATUS_CONFIG[t.value as AccessRequestStatus];
          const count = counts[t.value] ?? 0;
          if (!count) return null;
          return (
            <span
              key={t.value}
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: cfg.bg, color: cfg.text }}
            >
              {cfg.label}: {count}
            </span>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              statusFilter === t.value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {t.value !== "all" && counts[t.value] ? (
              <span className="ml-1.5 bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 text-[10px]">
                {counts[t.value]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
          <Building2 className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">No access requests{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""} yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Company</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Contact</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Submitted</th>
                <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((req) => {
                const cfg = STATUS_CONFIG[req.status];
                return (
                  <tr key={req.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{req.companyName}</p>
                      {req.companyWebsite && (
                        <a
                          href={req.companyWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-400 hover:text-[#0F4C81] flex items-center gap-0.5"
                        >
                          <Globe className="w-3 h-3" /> {req.companyWebsite.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800">{req.contactName}</p>
                      <p className="text-xs text-slate-400">{req.contactEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-lg"
                        style={{ background: cfg.bg, color: cfg.text }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(req.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setSelected(req); setActionError(""); setProvisionResult(null); }}
                        className="text-xs text-[#0F4C81] hover:underline font-medium"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer / modal */}
      {selected && (
        <Modal open={!!selected} title={`Access Request — ${selected.companyName}`} onClose={() => setSelected(null)}>
          <RequestDetail
            req={selected}
            actioning={actioning}
            actionError={actionError}
            provisionResult={provisionResult}
            onMarkUnderReview={() => handleMarkUnderReview(selected)}
            onApprove={() => handleApprove(selected)}
            onProvision={() => handleProvision(selected)}
            onReject={() => setShowRejectModal(true)}
            onSaveNotes={(notes) => handleSaveNotes(selected, notes)}
          />
        </Modal>
      )}

      {/* Reject confirmation modal */}
      {showRejectModal && selected && (
        <Modal open={showRejectModal} title="Reject Request" onClose={() => { setShowRejectModal(false); setRejectReason(""); }}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Rejecting access request from <strong>{selected.contactEmail}</strong>. This action is logged.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Rejection reason (optional)
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Outside our current market, duplicate request…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sendRejectEmail}
                onChange={(e) => setSendRejectEmail(e.target.checked)}
                className="rounded"
              />
              Send rejection email to applicant
            </label>
            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{actionError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(""); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(selected)}
                disabled={actioning}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium rounded-lg transition flex items-center gap-2"
              >
                {actioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RequestDetail({
  req, actioning, actionError, provisionResult,
  onMarkUnderReview, onApprove, onProvision, onReject, onSaveNotes,
}: {
  req: TenantAccessRequest;
  actioning: boolean;
  actionError: string;
  provisionResult: ProvisionResult | null;
  onMarkUnderReview: () => void;
  onApprove: () => void;
  onProvision: () => void;
  onReject: () => void;
  onSaveNotes: (n: string) => void;
}) {
  const [notes, setNotes] = useState(req.adminNotes ?? "");
  const cfg = STATUS_CONFIG[req.status];

  return (
    <div className="space-y-5 text-sm">
      {/* Status + honeypot warning */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.text }}>
          {cfg.label}
        </span>
        {req.honeypotTriggered && (
          <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            <AlertTriangle className="w-3 h-3" /> Honeypot triggered — possible bot
          </span>
        )}
      </div>

      {/* Company info */}
      <div className="grid grid-cols-2 gap-3">
        <DetailField icon={Building2} label="Company">{req.companyName}</DetailField>
        {req.companyWebsite && (
          <DetailField icon={Globe} label="Website">
            <a href={req.companyWebsite} target="_blank" rel="noopener noreferrer" className="text-[#0F4C81] hover:underline flex items-center gap-1">
              {req.companyWebsite.replace(/^https?:\/\//, "")} <ExternalLink className="w-3 h-3" />
            </a>
          </DetailField>
        )}
        <DetailField icon={Mail} label="Email">{req.contactEmail}</DetailField>
        {req.phone && <DetailField icon={Phone} label="Phone">{req.phone}</DetailField>}
        {req.country && <DetailField icon={Globe} label="Country">{req.country}</DetailField>}
        {req.eventName && <DetailField icon={Calendar} label="Event">{req.eventName}</DetailField>}
        {req.expectedUsers && <DetailField icon={Users} label="Expected users">{req.expectedUsers}</DetailField>}
        {req.crmSystem && <DetailField icon={Briefcase} label="CRM">{req.crmSystem}</DetailField>}
      </div>

      {req.useCase && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Use case</p>
          <p className="text-slate-700 text-xs bg-slate-50 rounded-lg px-3 py-2">{req.useCase}</p>
        </div>
      )}
      {req.message && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Message</p>
          <p className="text-slate-700 text-xs bg-slate-50 rounded-lg px-3 py-2">{req.message}</p>
        </div>
      )}
      {req.rejectionReason && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Rejection reason</p>
          <p className="text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">{req.rejectionReason}</p>
        </div>
      )}

      {/* Admin notes */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">Internal notes</p>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onSaveNotes(notes)}
          placeholder="Internal notes (not shared with applicant)…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 resize-none"
        />
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(req.createdAt).toLocaleString()}</span>
        {req.ipAddress && <span>IP: {req.ipAddress}</span>}
      </div>

      {/* Provision result */}
      {provisionResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            {provisionResult.wasAlreadyProvisioned ? "Already provisioned" : "Tenant provisioned successfully!"}
          </p>
          <p className="text-xs text-green-700">Tenant slug: <code className="font-mono">{provisionResult.tenantSlug}</code></p>
          {provisionResult.emailWarning && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {provisionResult.emailWarning}
              </p>
            </div>
          )}
        </div>
      )}

      {actionError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
        {req.status === "requested" && (
          <ActionBtn icon={Eye} onClick={onMarkUnderReview} loading={actioning} variant="secondary">
            Mark Under Review
          </ActionBtn>
        )}
        {(req.status === "requested" || req.status === "under_review") && (
          <>
            <ActionBtn icon={CheckCircle2} onClick={onApprove} loading={actioning} variant="primary">
              Approve
            </ActionBtn>
            <ActionBtn icon={XCircle} onClick={onReject} loading={actioning} variant="danger">
              Reject
            </ActionBtn>
          </>
        )}
        {req.status === "approved" && (
          <ActionBtn icon={RefreshCw} onClick={onProvision} loading={actioning} variant="primary">
            Provision Tenant
          </ActionBtn>
        )}
        {req.status === "provisioned" && req.createdTenantId && (
          <p className="text-xs text-slate-400 self-center">
            Tenant ID: <code className="font-mono text-slate-600">{req.createdTenantId}</code>
          </p>
        )}
      </div>
    </div>
  );
}

function DetailField({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className="text-sm text-slate-800">{children}</p>
    </div>
  );
}

function ActionBtn({
  icon: Icon, onClick, loading, variant, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  loading: boolean;
  variant: "primary" | "secondary" | "danger";
  children: React.ReactNode;
}) {
  const cls = {
    primary: "bg-[#0F4C81] hover:bg-[#0a3660] text-white",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition disabled:opacity-60 ${cls}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}
