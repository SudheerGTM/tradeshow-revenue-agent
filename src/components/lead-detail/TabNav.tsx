"use client";

import {
  LayoutGrid, Brain, Building2, Star, Mail, Briefcase, Activity, Mic, RefreshCw, TrendingUp, Workflow,
} from "lucide-react";

export type TabKey =
  | "overview" | "conversation" | "company" | "scoring" | "followup"
  | "opportunity" | "activity" | "voice" | "crm" | "roi" | "workflow";

export const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview",     label: "Overview",                  icon: LayoutGrid },
  { key: "workflow",     label: "Workflow",                   icon: Workflow },
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
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-1">
      {/* Mobile: scrollable chip row. Desktop/tablet: underline tabs. */}
      <div className="flex min-w-max gap-1.5 p-2 sm:p-1 sm:gap-0">
        {TABS.map(t => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 sm:py-3 text-xs font-medium whitespace-nowrap transition rounded-full sm:rounded-none sm:border-b-2 min-h-[40px] sm:min-h-0 ${
                isActive
                  ? "bg-[#0F4C81] text-white sm:bg-transparent sm:border-[#0F4C81] sm:text-[#0F4C81]"
                  : "bg-[#F8FAFC] text-[#64748B] sm:bg-transparent sm:border-transparent hover:text-[#0F172A]"
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
