"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Workflow, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type WorkflowStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

interface WorkflowRow {
  id: string;
  leadId: string;
  leadFirstName: string;
  leadLastName: string | null;
  companyName: string;
  workflowName: string;
  status: WorkflowStatus;
  currentStep: number;
  totalSteps: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  durationMs: number | null;
}

const STATUS_VARIANT: Record<WorkflowStatus, "blue" | "yellow" | "green" | "red" | "gray"> = {
  queued: "gray", running: "yellow", completed: "green", failed: "red", cancelled: "gray",
};

type FilterKey = "" | WorkflowStatus;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "", label: "All" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function WorkflowsClient({ userRole }: { userRole: string }) {
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    const res = await fetch(`/api/workflows?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">Workflow Monitoring</h1>
          <p className="text-sm text-[#475569] mt-0.5">
            Lead Qualification Workflow runs across your tenant.
            {userRole === "booth_user" && " View only."}
          </p>
        </div>
        <button onClick={fetchRows} className="flex items-center gap-1.5 text-xs text-[#00B8D9] hover:text-[#009ab8] font-medium self-start sm:self-auto">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-2 rounded-xl border transition font-medium whitespace-nowrap shrink-0 min-h-[36px] ${
              filter === f.key ? "bg-[#0F4C81] border-[#0F4C81] text-white" : "border-[#E2E8F0] text-[#475569] bg-white hover:border-[#CBD5E1]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#CBD5E1]" /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Workflow} title="No workflow runs found" description="Start a workflow from a lead's detail page to see it here." />
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-[#F8FAFC]">
              {rows.map((row) => (
                <Link key={row.id} href={`/workflows/${row.id}`} className="block p-4 active:bg-[#F8FAFC]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[#0F172A] truncate">{row.leadFirstName} {row.leadLastName ?? ""}</p>
                      <p className="text-xs text-[#475569] truncate mt-0.5">{row.companyName}</p>
                    </div>
                    <Badge variant={STATUS_VARIANT[row.status]} className="shrink-0">{row.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs text-[#475569]">
                    <span>Step {row.currentStep}/{row.totalSteps}</span>
                    <span>{fmtDuration(row.durationMs)}</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Tablet/Desktop: table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs text-[#94A3B8] uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">Workflow</th>
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Current Step</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Started</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Duration</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F8FAFC]">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#F8FAFC] transition">
                    <td className="px-5 py-3.5 text-[#475569] capitalize">{row.workflowName.replace(/_/g, " ")}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-[#0F172A]">{row.leadFirstName} {row.leadLastName ?? ""}</p>
                      <p className="text-xs text-[#94A3B8]">{row.companyName}</p>
                    </td>
                    <td className="px-5 py-3.5"><Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge></td>
                    <td className="px-5 py-3.5 text-[#0F172A] font-medium">{row.currentStep}/{row.totalSteps}</td>
                    <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">{row.startedAt ? new Date(row.startedAt).toLocaleString() : "—"}</td>
                    <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">{fmtDuration(row.durationMs)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/workflows/${row.id}`} className="text-xs text-[#00B8D9] hover:text-[#009ab8] font-medium">View Details →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
