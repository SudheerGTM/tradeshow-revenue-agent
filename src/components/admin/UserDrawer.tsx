"use client";

import { X, Target, Star, Briefcase, TrendingUp, Clock } from "lucide-react";
import { Badge, statusBadge } from "@/components/ui/Badge";
import { RoleBadge } from "@/components/admin/RoleBadge";
import { mockLastActive } from "@/lib/mockActivity";

export interface UserDrawerActivity {
  id: string;
  action: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  user: { id: string; name: string; email: string; role: string; status: string } | null;
  perf: { leadsCaptured: number; qualifiedLeads: number; opportunitiesCreated: number; pipelineGenerated: number };
  recentActivity: UserDrawerActivity[];
}

function fmtGBP(n: number) { return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`; }

const ACTION_LABEL: Record<string, string> = {
  "lead.created": "Lead Captured",
  "lead_score_generated": "Lead Scored",
  "followup_generated": "Follow-Up Generated",
  "followup_approved": "Follow-Up Approved",
  "crm_sync_approved": "CRM Sync Approved",
  "opportunity_created": "Opportunity Created",
  "opportunity_stage_changed": "Pipeline Updated",
  "opportunity_won": "Opportunity Won",
};

export function UserDrawer({ open, onClose, user, perf, recentActivity }: Props) {
  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="h-14 px-5 flex items-center justify-between border-b border-[#E2E8F0] shrink-0">
          <p className="text-sm font-semibold text-[#0F172A]">User Performance</p>
          <button onClick={onClose} aria-label="Close" className="text-[#94A3B8] hover:text-[#0F172A] w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#F8FAFC] transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Profile */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#0F4C81] flex items-center justify-center text-white text-lg font-bold shrink-0">
              {user.name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-[#0F172A] truncate">{user.name}</p>
              <p className="text-xs text-[#94A3B8] truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <RoleBadge role={user.role} />
            <Badge variant={statusBadge(user.status)}>{user.status}</Badge>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <Clock className="w-3.5 h-3.5 text-[#94A3B8]" /> Last Login: {mockLastActive(user.id)}
          </div>

          {/* Performance */}
          <div>
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Performance</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={Target} label="Leads Captured" value={String(perf.leadsCaptured)} color="#0F4C81" bg="#dbeafe" />
              <Stat icon={Star} label="Qualified Leads" value={String(perf.qualifiedLeads)} color="#d97706" bg="#fef3c7" />
              <Stat icon={Briefcase} label="Opportunities Created" value={String(perf.opportunitiesCreated)} color="#00B8D9" bg="#e6f8fc" />
              <Stat icon={TrendingUp} label="Pipeline Generated" value={fmtGBP(perf.pipelineGenerated)} color="#16A34A" bg="#dcfce7" />
            </div>
          </div>

          {/* Recent activity */}
          <div>
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Recent Activity</p>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No activity recorded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {recentActivity.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00B8D9] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#0F172A] truncate">{ACTION_LABEL[a.action] ?? a.action.replace(/[._]/g, " ")}</p>
                    </div>
                    <span className="text-[10px] text-[#94A3B8] shrink-0">{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color, bg }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; color: string; bg: string;
}) {
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: bg }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <p className="text-base font-bold text-[#0F172A] truncate">{value}</p>
      <p className="text-[10px] text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  );
}
