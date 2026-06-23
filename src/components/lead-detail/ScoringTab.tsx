"use client";

import { LeadScorePanel } from "@/components/LeadScorePanel";
import type { Classification, LeadScoreSummary } from "./types";

const CLASSIFICATION_STYLE: Record<Classification, { label: string; text: string }> = {
  hot:          { label: "Hot",          text: "#DC2626" },
  warm:         { label: "Warm",         text: "#d97706" },
  cold:         { label: "Cold",         text: "#0F4C81" },
  needs_review: { label: "Needs Review", text: "#64748B" },
};

export function ScoringTab({ leadId, score }: { leadId: string; score: LeadScoreSummary | null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-1">
        <Gauge score={score} />
      </div>
      <div className="lg:col-span-2">
        <LeadScorePanel leadId={leadId} />
      </div>
    </div>
  );
}

function Gauge({ score }: { score: LeadScoreSummary | null }) {
  const value = score ? Math.round(parseFloat(score.score)) : 0;
  const confidence = score?.confidenceScore ? Math.round(parseFloat(score.confidenceScore)) : null;
  const cls = score ? CLASSIFICATION_STYLE[score.classification] : null;

  // Semi-circle gauge: 180 degree arc, value 0-100
  const radius = 80;
  const circumference = Math.PI * radius;
  const filled = (value / 100) * circumference;
  const color = value >= 80 ? "#DC2626" : value >= 55 ? "#d97706" : value > 0 ? "#0F4C81" : "#CBD5E1";

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6 flex flex-col items-center">
      <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider self-start mb-2">Lead Score</p>
      <svg width="200" height="120" viewBox="0 0 200 120">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#F1F5F9" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
        <text x="100" y="85" textAnchor="middle" fontSize="34" fontWeight="bold" fill="#0F172A">{value}</text>
        <text x="100" y="105" textAnchor="middle" fontSize="11" fill="#94A3B8">/ 100</text>
      </svg>
      {cls && (
        <span className="text-sm font-semibold mt-2" style={{ color: cls.text }}>{cls.label}</span>
      )}
      {confidence != null && (
        <p className="text-xs text-[#94A3B8] mt-1">{confidence}% confidence</p>
      )}
    </div>
  );
}
