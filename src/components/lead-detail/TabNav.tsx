"use client";

import {
  LayoutGrid, Brain, Building2, Star, Mail, Briefcase, Activity, Mic, RefreshCw, TrendingUp,
} from "lucide-react";

export type TabKey =
  | "overview" | "conversation" | "company" | "scoring" | "followup"
  | "opportunity" | "activity" | "voice" | "crm" | "roi";

export const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview",     label: "Overview",                  icon: LayoutGrid },
  { key: "conversation", label: "Conversation Intelligence",  icon: Brain },
  { key: "company",      label: "Company Intelligence",       icon: Building2 },
  { key: "scoring",      label: "Lead Scoring",                icon: Star },
  { key: "followup",     label: "Follow-Up Intelligence",      icon: Mail },
  { key: "opportunity",  label: "Opportunity",                 icon: Briefcase },
  { key: "activity",     label: "Activity Timeline",           icon: Activity },
  { key: "voice",        label: "Voice & Files",                icon: Mic },
  { key: "crm",          label: "CRM Sync",                    icon: RefreshCw },
  { key: "roi",          label: "ROI Impact",                  icon: TrendingUp },
];

export function TabNav({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-x-auto">
      <div className="flex min-w-max px-1">
        {TABS.map(t => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition ${
                isActive
                  ? "border-[#0F4C81] text-[#0F4C81]"
                  : "border-transparent text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
