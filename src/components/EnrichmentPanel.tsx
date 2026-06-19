"use client";

import { useState, useEffect } from "react";
import {
  Sparkles, Building2, User, Globe, Link2,
  Users, DollarSign, MapPin, Calendar, Loader2,
  AlertTriangle, CheckCircle, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type EnrichmentStatus = "not_enriched" | "enriched" | "partially_enriched" | "failed" | "needs_review";

interface CompanyRow {
  companyName: string | null; website: string | null; linkedinUrl: string | null;
  industry: string | null; subIndustry: string | null; employeeCount: string | null;
  employeeRange: string | null; annualRevenue: string | null; revenueRange: string | null;
  headquarters: string | null; foundedYear: string | null; companyDescription: string | null;
  enrichmentStatus: EnrichmentStatus; needsReview: boolean; failureReason: string | null; updatedAt: string;
}

interface ContactRow {
  firstName: string | null; lastName: string | null; linkedinUrl: string | null;
  seniority: string | null; department: string | null; jobFunction: string | null;
  enrichmentStatus: EnrichmentStatus; needsReview: boolean; failureReason: string | null; updatedAt: string;
}

interface Props { leadId: string; userRole: string; }

export function EnrichmentPanel({ leadId, userRole }: Props) {
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");

  const canEnrich = userRole !== "booth_user";

  useEffect(() => { fetchEnrichment(); }, [leadId]);

  async function fetchEnrichment() {
    setLoading(true);
    try {
      const res = await fetch(`/api/enrichment?lead_id=${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setCompany(data.company);
        setContact(data.contact);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    setError("");
    try {
      const res = await fetch("/api/enrichment/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enrichment failed");
      setCompany(data.company);
      setContact(data.contact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }

  const overallStatus: EnrichmentStatus =
    !company && !contact ? "not_enriched"
    : company?.enrichmentStatus === "enriched" && contact?.enrichmentStatus === "enriched" ? "enriched"
    : company?.needsReview || contact?.needsReview ? "needs_review"
    : (company?.enrichmentStatus === "enriched" || contact?.enrichmentStatus === "enriched") ? "partially_enriched"
    : "failed";

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex justify-center shadow-sm">
        <Loader2 className="w-5 h-5 animate-spin text-[#CBD5E1]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + trigger */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00B8D9] shrink-0" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">
              Company Intelligence · Apollo
            </p>
          </div>
          <EnrichmentStatusBadge status={overallStatus} />
        </div>

        {company?.updatedAt && (
          <p className="text-[11px] text-[#94A3B8]">
            Last enriched: {new Date(company.updatedAt).toLocaleString()}
          </p>
        )}

        {error && (
          <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {canEnrich && (
          <Button onClick={handleEnrich} loading={enriching} variant="secondary" className="w-full">
            <Sparkles className="w-4 h-4" />
            {overallStatus === "not_enriched" ? "Enrich Lead" : "Re-run Enrichment"}
          </Button>
        )}

        {!canEnrich && overallStatus === "not_enriched" && (
          <p className="text-xs text-[#94A3B8] text-center">Enrichment is run by managers and above.</p>
        )}
      </div>

      {/* Company Intelligence */}
      {company && company.enrichmentStatus !== "not_enriched" && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#94A3B8]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Company</p>
            {company.needsReview && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-[#d97706]">
                <AlertTriangle className="w-3 h-3" /> Needs Review
              </span>
            )}
          </div>
          {company.enrichmentStatus === "failed" ? (
            <div className="px-5 py-4 text-xs text-[#DC2626]">
              {company.failureReason ?? "Company not found in Apollo"}
            </div>
          ) : (
            <div className="divide-y divide-[#F8FAFC]">
              <InfoRow icon={Building2}  label="Company"   value={company.companyName} />
              <InfoRow icon={Globe}      label="Website"   value={company.website} link />
              <InfoRow icon={Link2}      label="LinkedIn"  value={company.linkedinUrl} link />
              <InfoRow icon={Building2}  label="Industry"  value={[company.industry, company.subIndustry].filter(Boolean).join(" · ")} />
              <InfoRow icon={Users}      label="Employees" value={company.employeeRange ?? company.employeeCount} />
              <InfoRow icon={DollarSign} label="Revenue"   value={company.revenueRange ?? company.annualRevenue} />
              <InfoRow icon={MapPin}     label="HQ"        value={company.headquarters} />
              <InfoRow icon={Calendar}   label="Founded"   value={company.foundedYear} />
              {company.companyDescription && (
                <div className="px-5 py-3.5">
                  <p className="text-xs text-[#94A3B8] mb-1">About</p>
                  <p className="text-xs text-[#475569] leading-relaxed">{company.companyDescription}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Contact Intelligence */}
      {contact && contact.enrichmentStatus !== "not_enriched" && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center gap-2">
            <User className="w-4 h-4 text-[#94A3B8]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Contact</p>
            {contact.needsReview && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-[#d97706]">
                <AlertTriangle className="w-3 h-3" /> Needs Review
              </span>
            )}
          </div>
          {contact.enrichmentStatus === "failed" ? (
            <div className="px-5 py-4 text-xs text-[#DC2626]">
              {contact.failureReason ?? "Contact not found in Apollo"}
            </div>
          ) : (
            <div className="divide-y divide-[#F8FAFC]">
              <InfoRow icon={User}      label="Name"       value={[contact.firstName, contact.lastName].filter(Boolean).join(" ")} />
              <InfoRow icon={Link2}     label="LinkedIn"   value={contact.linkedinUrl} link />
              <InfoRow icon={User}      label="Seniority"  value={contact.seniority} />
              <InfoRow icon={Building2} label="Department" value={contact.department} />
              <InfoRow icon={Sparkles}  label="Function"   value={contact.jobFunction} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon, label, value, link = false,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null; link?: boolean }) {
  if (!value) return null;
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <Icon className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
      <span className="text-xs text-[#94A3B8] w-20 shrink-0">{label}</span>
      {link ? (
        <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          className="text-xs text-[#00B8D9] hover:text-[#009ab8] transition truncate">
          {value}
        </a>
      ) : (
        <span className="text-xs text-[#0F172A] truncate">{value}</span>
      )}
    </div>
  );
}

function EnrichmentStatusBadge({ status }: { status: EnrichmentStatus }) {
  const map: Record<EnrichmentStatus, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
    not_enriched:       { label: "Not Enriched",  icon: XCircle,       cls: "text-[#94A3B8]" },
    enriched:           { label: "Enriched",       icon: CheckCircle,   cls: "text-[#16A34A]" },
    partially_enriched: { label: "Partial",        icon: AlertTriangle, cls: "text-[#d97706]" },
    failed:             { label: "Failed",         icon: XCircle,       cls: "text-[#DC2626]" },
    needs_review:       { label: "Needs Review",   icon: AlertTriangle, cls: "text-[#d97706]" },
  };
  const { label, icon: Icon, cls } = map[status];
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${cls}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}
