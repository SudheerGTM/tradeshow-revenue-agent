"use client";

import { Building2, MapPin, Sparkles, Briefcase, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Classification, LeadScoreSummary } from "./types";
import { fmtGBP } from "./types";

const CLASSIFICATION_STYLE: Record<Classification, { label: string; bg: string; text: string }> = {
  hot:          { label: "Hot Lead",          bg: "#fee2e2", text: "#DC2626" },
  warm:         { label: "Warm Lead",         bg: "#fef3c7", text: "#d97706" },
  cold:         { label: "Cold Lead",         bg: "#dbeafe", text: "#0F4C81" },
  needs_review: { label: "Needs Review",      bg: "#f1f5f9", text: "#64748B" },
};

interface Props {
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
  companyName: string;
  country: string | null;
  score: LeadScoreSummary | null;
  onGenerateFollowUp: () => void;
  onCreateOpportunity: () => void;
  onPrepareCrmSync: () => void;
}

export function LeadHeader({
  firstName, lastName, jobTitle, companyName, country, score,
  onGenerateFollowUp, onCreateOpportunity, onPrepareCrmSync,
}: Props) {
  const cls = score ? CLASSIFICATION_STYLE[score.classification] : null;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        {/* Identity */}
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-[#0F4C81] flex items-center justify-center text-white text-xl font-bold shrink-0">
            {firstName[0]?.toUpperCase()}{(lastName ?? "")[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#0F172A] leading-tight truncate">
              {firstName} {lastName ?? ""}
            </h1>
            <p className="text-sm text-[#475569] mt-0.5 truncate">{jobTitle ?? "—"}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-[#94A3B8]">
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {companyName}</span>
              {country && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {country}</span>}
            </div>
          </div>
        </div>

        {/* Score + revenue snapshot */}
        <div className="flex items-center gap-4 shrink-0">
          {cls && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl" style={{ background: cls.bg, color: cls.text }}>
              {cls.label}
            </span>
          )}
          <div className="text-center px-4 border-l border-[#F1F5F9]">
            <p className="text-2xl font-bold text-[#0F172A]">{score ? Math.round(parseFloat(score.score)) : "—"}<span className="text-sm text-[#94A3B8] font-normal">/100</span></p>
            <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Lead Score</p>
          </div>
          <div className="text-center px-4 border-l border-[#F1F5F9]">
            <p className="text-2xl font-bold text-[#16A34A]">{score ? fmtGBP(score.expectedRevenue != null ? parseFloat(score.expectedRevenue) : null) : "—"}</p>
            <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Expected Revenue</p>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-[#F1F5F9]">
        <Button variant="secondary" size="sm" onClick={onGenerateFollowUp}>
          <Sparkles className="w-3.5 h-3.5" /> Generate Follow-Up
        </Button>
        <Button variant="secondary" size="sm" onClick={onCreateOpportunity}>
          <Briefcase className="w-3.5 h-3.5" /> Create Opportunity
        </Button>
        <Button variant="secondary" size="sm" onClick={onPrepareCrmSync}>
          <RefreshCw className="w-3.5 h-3.5" /> Prepare CRM Sync
        </Button>
      </div>
    </div>
  );
}
