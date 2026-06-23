import { Activity } from "lucide-react";

export interface ActivityRow {
  id: string;
  action: string;
  userName: string | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  "lead.created": "Lead Captured",
  "lead.updated": "Lead Updated",
  "lead.status_changed": "Lead Status Changed",
  "user.created": "User Added",
  "user.updated": "Role/Status Changed",
  "lead_score_generated": "Lead Score Generated",
  "lead_score_regenerated": "Lead Score Regenerated",
  "followup_generated": "Follow-Up Generated",
  "followup_approved": "Follow-Up Approved",
  "followup_rejected": "Follow-Up Rejected",
  "crm_sync_prepared": "CRM Sync Prepared",
  "crm_sync_approved": "CRM Sync Approved",
  "crm_sync_completed": "CRM Sync Completed",
  "crm_sync_failed": "CRM Sync Failed",
  "opportunity_created": "Opportunity Created",
  "opportunity_stage_changed": "Opportunity Stage Changed",
  "opportunity_won": "Opportunity Won",
  "opportunity_lost": "Opportunity Lost",
  "event_cost_added": "Event Cost Added",
  "roi_calculated": "ROI Calculated",
  "executive_summary_generated": "Executive Summary Generated",
  "report_exported": "Report Exported",
};

function describeAction(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RecentActivityCard({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
      <div className="px-4 sm:px-6 py-4 flex items-center gap-2 border-b border-[#F1F5F9]">
        <Activity className="w-4 h-4 text-[#0F4C81]" />
        <p className="text-sm font-semibold text-[#0F172A]">Recent Tenant Activity</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 sm:px-6 py-6 text-sm text-[#94A3B8] text-center">No activity recorded yet.</p>
      ) : (
        <div className="divide-y divide-[#F1F5F9]">
          {rows.map((r) => (
            <div key={r.id} className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00B8D9] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-[#0F172A] truncate">{describeAction(r.action)}</p>
                  <p className="text-[11px] text-[#94A3B8] truncate">{r.userName ?? "System"}</p>
                </div>
              </div>
              <span className="text-[11px] text-[#94A3B8] shrink-0 whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
