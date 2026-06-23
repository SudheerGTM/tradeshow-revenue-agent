"use client";

import { Target } from "lucide-react";
import { EnrichmentPanel } from "@/components/EnrichmentPanel";
import type { CompanyEnrichmentSummary, LeadScoreSummary } from "./types";

interface Props {
  leadId: string;
  userRole: string;
  company: CompanyEnrichmentSummary | null;
  score: LeadScoreSummary | null;
}

type FitLevel = "Strong" | "Moderate" | "Weak" | "Unknown";

const FIT_STYLE: Record<FitLevel, { bg: string; text: string }> = {
  Strong:   { bg: "#dcfce7", text: "#16A34A" },
  Moderate: { bg: "#fef3c7", text: "#d97706" },
  Weak:     { bg: "#fee2e2", text: "#DC2626" },
  Unknown:  { bg: "#f1f5f9", text: "#64748B" },
};

export function CompanyIntelTab({ leadId, userRole, company, score }: Props) {
  const icp = deriveICPFit(company, score);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <EnrichmentPanel leadId={leadId} userRole={userRole} />
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">ICP Match</p>
          </div>
          <FitRow label="Industry Fit" fit={icp.industryFit} />
          <FitRow label="Company Size Fit" fit={icp.sizeFit} />
          <FitRow label="Revenue Potential" fit={icp.revenuePotential} />
          <FitRow label="Strategic Fit" fit={icp.strategicFit} />
          <p className="text-[11px] text-[#94A3B8] pt-1">Derived from company enrichment and lead score data — not a separate calculation.</p>
        </div>
      </div>
    </div>
  );
}

function FitRow({ label, fit }: { label: string; fit: FitLevel }) {
  const s = FIT_STYLE[fit];
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#475569]">{label}</span>
      <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: s.bg, color: s.text }}>{fit}</span>
    </div>
  );
}

function deriveICPFit(company: CompanyEnrichmentSummary | null, score: LeadScoreSummary | null) {
  const industry = (company?.industry ?? "").toLowerCase();
  const logisticsKeywords = ["logistics", "freight", "transport", "supply chain", "shipping", "warehous"];
  const industryFit: FitLevel = !company?.industry ? "Unknown"
    : logisticsKeywords.some(k => industry.includes(k)) ? "Strong" : "Moderate";

  const empCount = parseInt((company?.employeeCount ?? "").replace(/,/g, ""), 10);
  const sizeFit: FitLevel = !company?.employeeCount ? "Unknown"
    : empCount >= 200 ? "Strong" : empCount >= 50 ? "Moderate" : "Weak";

  const oppValue = score?.estimatedOpportunityValue != null ? parseFloat(score.estimatedOpportunityValue) : null;
  const revenuePotential: FitLevel = oppValue == null ? "Unknown"
    : oppValue >= 20000 ? "Strong" : oppValue >= 7500 ? "Moderate" : "Weak";

  const companyFitScore = score?.companyFitScore != null ? parseFloat(score.companyFitScore) : null;
  const strategicFit: FitLevel = companyFitScore == null ? "Unknown"
    : companyFitScore >= 18 ? "Strong" : companyFitScore >= 10 ? "Moderate" : "Weak";

  return { industryFit, sizeFit, revenuePotential, strategicFit };
}
