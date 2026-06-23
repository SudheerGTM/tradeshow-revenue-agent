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
    <>
      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-5">
          {/* Identity */}
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-[#0F4C81] flex items-center justify-center text-white text-base sm:text-xl font-bold shrink-0">
              {firstName[0]?.toUpperCase()}{(lastName ?? "")[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-[#0F172A] leading-tight truncate">
                {firstName} {lastName ?? ""}
              </h1>
              <p className="text-sm text-[#475569] mt-0.5 truncate">{jobTitle ?? "—"}</p>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-[#94A3B8]">
                <span className="flex items-center gap-1 truncate"><Building2 className="w-3.5 h-3.5 shrink-0" /> {companyName}</span>
                {country && <span className="flex items-center gap-1 truncate"><MapPin className="w-3.5 h-3.5 shrink-0" /> {country}</span>}
              </div>
            </div>
          </div>

          {/* Score + revenue snapshot */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0 overflow-x-auto">
            {cls && (
              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl whitespace-nowrap shrink-0" style={{ background: cls.bg, color: cls.text }}>
                {cls.label}
              </span>
            )}
            <div className="text-center px-3 sm:px-4 border-l border-[#F1F5F9] shrink-0">
              <p className="text-xl sm:text-2xl font-bold text-[#0F172A]">{score ? Math.round(parseFloat(score.score)) : "—"}<span className="text-sm text-[#94A3B8] font-normal">/100</span></p>
              <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider whitespace-nowrap">Lead Score</p>
            </div>
            <div className="text-center px-3 sm:px-4 border-l border-[#F1F5F9] shrink-0">
              <p className="text-xl sm:text-2xl font-bold text-[#16A34A]">{score ? fmtGBP(score.expectedRevenue != null ? parseFloat(score.expectedRevenue) : null) : "—"}</p>
              <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider whitespace-nowrap">Expected Revenue</p>
            </div>
          </div>
        </div>

        {/* Action bar — hidden on mobile, replaced by sticky bottom bar */}
        <div className="hidden md:flex flex-wrap gap-2 mt-5 pt-5 border-t border-[#F1F5F9]">
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

      {/* Mobile sticky action bar — sits above the global bottom nav */}
      <div
        className="md:hidden fixed left-0 right-0 z-30 bg-white border-t border-[#E2E8F0] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-3 py-2 flex gap-2"
        style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
      >
        <button onClick={onGenerateFollowUp} className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl bg-[#F8FAFC] text-[#0F4C81] text-[11px] font-medium">
          <Sparkles className="w-4 h-4" /> Follow-Up
        </button>
        <button onClick={onCreateOpportunity} className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl bg-[#F8FAFC] text-[#0F4C81] text-[11px] font-medium">
          <Briefcase className="w-4 h-4" /> Opportunity
        </button>
        <button onClick={onPrepareCrmSync} className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl bg-[#F8FAFC] text-[#0F4C81] text-[11px] font-medium">
          <RefreshCw className="w-4 h-4" /> CRM Sync
        </button>
      </div>
      {/* Spacer so content isn't hidden behind the two fixed mobile bars */}
      <div className="md:hidden h-16" />
    </>
  );
}
