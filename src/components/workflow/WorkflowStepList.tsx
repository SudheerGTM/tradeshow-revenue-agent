"use client";

import { CheckCircle2, XCircle, Loader2, Clock, MinusCircle } from "lucide-react";

export interface ExecutionRow {
  id: string;
  agentName: string;
  stepOrder: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  outputPayload: Record<string, unknown> | null;
  errorMessage: string | null;
}

const AGENT_LABEL: Record<string, string> = {
  conversation_agent: "Conversation Agent",
  enrichment_agent: "Company Enrichment Agent",
  lead_scoring_agent: "Lead Scoring Agent",
  followup_agent: "Follow-Up Agent",
  crm_sync_agent: "CRM Recommendation Agent",
  roi_agent: "ROI Attribution Agent",
};

function StatusIcon({ status }: { status: ExecutionRow["status"] }) {
  switch (status) {
    case "completed": return <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />;
    case "failed": return <XCircle className="w-4 h-4 text-[#DC2626]" />;
    case "running": return <Loader2 className="w-4 h-4 text-[#00B8D9] animate-spin" />;
    case "skipped": return <MinusCircle className="w-4 h-4 text-[#94A3B8]" />;
    case "cancelled": return <XCircle className="w-4 h-4 text-[#94A3B8]" />;
    default: return <Clock className="w-4 h-4 text-[#CBD5E1]" />;
  }
}

export function WorkflowStepList({ executions, compact }: { executions: ExecutionRow[]; compact?: boolean }) {
  const sorted = [...executions].sort((a, b) => a.stepOrder - b.stepOrder);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {sorted.map((e) => (
        <div key={e.id} className={`flex items-start gap-3 ${compact ? "" : "bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5"}`}>
          <StatusIcon status={e.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className={`font-medium text-[#0F172A] ${compact ? "text-sm" : "text-sm"}`}>{AGENT_LABEL[e.agentName] ?? e.agentName}</p>
              {!compact && e.durationMs != null && <span className="text-xs text-[#94A3B8]">{e.durationMs}ms</span>}
            </div>
            {!compact && e.errorMessage && (
              <p className="text-xs text-[#DC2626] mt-1">{e.errorMessage}</p>
            )}
            {!compact && e.retryCount > 0 && (
              <p className="text-[11px] text-[#d97706] mt-0.5">Retried {e.retryCount}x</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
