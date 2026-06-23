"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, CheckCircle2, XCircle, Wrench, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type AgentStatus = "active" | "inactive" | "maintenance";

interface AgentRow {
  id: string;
  agentName: string;
  agentType: string;
  description: string | null;
  version: string;
  status: AgentStatus;
  supportsRetry: boolean;
  maxRetries: number;
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  skippedExecutions: number;
  successRate: number | null;
  avgRuntimeMs: number | null;
  totalRetries: number;
  lastExecutionAt: string | null;
  lastExecutionStatus: string | null;
}

const STATUS_VARIANT: Record<AgentStatus, "green" | "red" | "yellow"> = {
  active: "green", inactive: "red", maintenance: "yellow",
};

const AGENT_LABEL: Record<string, string> = {
  conversation_agent: "Conversation Agent",
  enrichment_agent: "Enrichment Agent",
  lead_scoring_agent: "Lead Scoring Agent",
  followup_agent: "Follow-Up Agent",
  crm_sync_agent: "CRM Sync Agent",
  roi_agent: "ROI Agent",
};

function successRateColor(rate: number | null): string {
  if (rate == null) return "#94A3B8";
  if (rate >= 95) return "#16A34A";
  if (rate >= 80) return "#d97706";
  return "#DC2626";
}

export function AgentsClient({ userRole }: { userRole: string }) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/agents");
    if (res.ok) setAgents(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">Agent Health Monitoring</h1>
          <p className="text-sm text-[#475569] mt-0.5">
            Registry and execution health for every agent in the orchestrator.
            {userRole === "booth_user" && " Read-only view."}
          </p>
        </div>
        <button onClick={fetchAgents} className="flex items-center gap-1.5 text-xs text-[#00B8D9] hover:text-[#009ab8] font-medium self-start sm:self-auto">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#CBD5E1]" /></div>
      ) : agents.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
          <EmptyState icon={Bot} title="No agents registered" description="The agent registry should be seeded via migration." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <div key={a.id} className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#dbeafe] flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-[#0F4C81]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A] truncate">{AGENT_LABEL[a.agentName] ?? a.agentName}</p>
                    <p className="text-[11px] text-[#94A3B8]">v{a.version}</p>
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[a.status]} className="shrink-0">{a.status}</Badge>
              </div>

              {a.description && <p className="text-xs text-[#475569]">{a.description}</p>}

              <div className="grid grid-cols-2 gap-3">
                <Stat label="Success Rate" value={a.successRate != null ? `${a.successRate}%` : "—"} color={successRateColor(a.successRate)} />
                <Stat label="Avg Runtime" value={a.avgRuntimeMs != null ? `${a.avgRuntimeMs}ms` : "—"} color="#0F4C81" />
                <Stat label="Total Runs" value={String(a.totalExecutions)} color="#0F172A" />
                <Stat label="Retries" value={String(a.totalRetries)} color="#d97706" />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#F1F5F9] text-xs">
                <span className="text-[#94A3B8]">Last execution</span>
                <span className="flex items-center gap-1 text-[#475569]">
                  {a.lastExecutionStatus === "completed" && <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />}
                  {a.lastExecutionStatus === "failed" && <XCircle className="w-3.5 h-3.5 text-[#DC2626]" />}
                  {a.lastExecutionStatus === "skipped" && <Wrench className="w-3.5 h-3.5 text-[#94A3B8]" />}
                  {a.lastExecutionAt ? new Date(a.lastExecutionAt).toLocaleString() : "Never run"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  );
}
