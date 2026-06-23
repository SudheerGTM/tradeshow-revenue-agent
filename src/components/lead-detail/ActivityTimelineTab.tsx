"use client";

import {
  UserPlus, Building2, Brain, Star, Mail, Briefcase, RefreshCw, Tag, FileText,
} from "lucide-react";

interface AuditEntry {
  id: string; action: string; metadata: Record<string, unknown> | null; createdAt: string; userId: string | null;
}

const ICON_FOR_PREFIX: { prefix: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { prefix: "lead.status", icon: Tag, color: "#0F4C81" },
  { prefix: "lead.", icon: UserPlus, color: "#0F4C81" },
  { prefix: "company_enrichment", icon: Building2, color: "#00B8D9" },
  { prefix: "contact_enrichment", icon: Building2, color: "#00B8D9" },
  { prefix: "conversation_analysis", icon: Brain, color: "#00B8D9" },
  { prefix: "lead_score", icon: Star, color: "#F59E0B" },
  { prefix: "followup", icon: Mail, color: "#16A34A" },
  { prefix: "opportunity", icon: Briefcase, color: "#0F4C81" },
  { prefix: "crm_sync", icon: RefreshCw, color: "#0F4C81" },
];

function iconFor(action: string) {
  const match = ICON_FOR_PREFIX.find(m => action.startsWith(m.prefix));
  return match ?? { icon: FileText, color: "#94A3B8" };
}

function describe(action: string): string {
  const labels: Record<string, string> = {
    "lead.created": "Lead Captured",
    "lead.updated": "Lead Details Updated",
    "lead.status_changed": "Status Changed",
    "company_enrichment_completed": "Company Enriched (Apollo)",
    "contact_enrichment_completed": "Contact Enriched (Apollo)",
    "conversation_analysis_started": "Conversation Analysis Started",
    "conversation_analysis_completed": "Conversation Analysis Completed",
    "conversation_analysis_needs_review": "Conversation Analysis — Needs Review",
    "lead_score_generated": "Lead Score Generated",
    "lead_score_regenerated": "Lead Score Regenerated",
    "lead_score_needs_review": "Lead Score — Needs Review",
    "followup_generated": "Follow-Up Generated",
    "followup_regenerated": "Follow-Up Regenerated",
    "followup_approved": "Follow-Up Approved",
    "followup_rejected": "Follow-Up Rejected",
    "opportunity_created": "Opportunity Created",
    "opportunity_stage_changed": "Opportunity Stage Changed",
    "opportunity_amount_changed": "Opportunity Amount Changed",
    "opportunity_won": "Opportunity Won",
    "opportunity_lost": "Opportunity Lost",
    "crm_sync_prepared": "CRM Sync Prepared",
    "crm_sync_approved": "CRM Sync Approved",
    "crm_sync_rejected": "CRM Sync Rejected",
    "crm_sync_completed": "CRM Sync Completed",
    "crm_sync_failed": "CRM Sync Failed",
  };
  return labels[action] ?? action.replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function ActivityTimelineTab({ history }: { history: AuditEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-10 text-center">
        <FileText className="w-8 h-8 text-[#E2E8F0] mx-auto mb-2" />
        <p className="text-sm text-[#94A3B8]">No activity recorded yet.</p>
      </div>
    );
  }

  const sorted = [...history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6">
      <div className="relative pl-6 border-l-2 border-[#F1F5F9] space-y-6">
        {sorted.map(entry => {
          const { icon: Icon, color } = iconFor(entry.action);
          return (
            <div key={entry.id} className="relative">
              <div
                className="absolute -left-[31px] w-6 h-6 rounded-full flex items-center justify-center border-2 border-white"
                style={{ background: color }}
              >
                <Icon className="w-3 h-3 text-white" />
              </div>
              <p className="text-sm font-medium text-[#0F172A]">{describe(entry.action)}</p>
              {entry.metadata && typeof entry.metadata === "object" && "to" in entry.metadata && (
                <p className="text-xs text-[#475569] mt-0.5">
                  {String((entry.metadata as { from?: string }).from ?? "")} → {String((entry.metadata as { to?: string }).to ?? "")}
                </p>
              )}
              <p className="text-[11px] text-[#94A3B8] mt-0.5">{new Date(entry.createdAt).toLocaleString()}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
