"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WorkflowStepList, type ExecutionRow } from "@/components/workflow/WorkflowStepList";

type WorkflowStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

interface WorkflowDetail {
  run: {
    id: string; leadId: string; workflowName: string; status: WorkflowStatus;
    currentStep: number; totalSteps: number; startedAt: string | null; completedAt: string | null; createdAt: string;
  };
  executions: ExecutionRow[];
  lead: { firstName: string; lastName: string | null; companyName: string } | null;
}

const STATUS_VARIANT: Record<WorkflowStatus, "blue" | "yellow" | "green" | "red" | "gray"> = {
  queued: "gray", running: "yellow", completed: "green", failed: "red", cancelled: "gray",
};

export function WorkflowDetailClient({ workflowId, userRole }: { workflowId: string; userRole: string }) {
  const [data, setData] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  const canRetry = userRole === "manager" || userRole === "tenant_admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/workflows/${workflowId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [workflowId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleRetry() {
    setRetrying(true);
    setError("");
    try {
      const res = await fetch(`/api/workflows/${workflowId}/retry`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Retry failed");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#CBD5E1]" /></div>;
  }

  const { run, executions, lead } = data;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start gap-4">
        <Link href="/workflows" className="text-[#94A3B8] hover:text-[#475569] mt-0.5 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#0F172A] capitalize">{run.workflowName.replace(/_/g, " ")}</h1>
          {lead && (
            <p className="text-sm text-[#475569] mt-0.5">
              {lead.firstName} {lead.lastName ?? ""} · {lead.companyName} ·{" "}
              <Link href={`/leads/${run.leadId}`} className="text-[#00B8D9] hover:text-[#009ab8]">View Lead</Link>
            </p>
          )}
        </div>
        <Badge variant={STATUS_VARIANT[run.status]} className="text-sm px-3 py-1">{run.status}</Badge>
      </div>

      {error && <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{error}</p>}

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <Field label="Progress" value={`${run.currentStep}/${run.totalSteps} steps`} />
          <Field label="Started" value={run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"} />
          <Field label="Completed" value={run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"} />
          <Field
            label="Duration"
            value={run.startedAt && run.completedAt ? `${((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s` : "—"}
          />
        </div>

        {run.status === "failed" && canRetry && (
          <Button onClick={handleRetry} loading={retrying} variant="secondary" className="w-full mb-5">
            <RefreshCw className="w-4 h-4" /> Retry Failed Workflow
          </Button>
        )}

        <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Execution History</p>
        <WorkflowStepList executions={executions} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-[#0F172A] mt-0.5">{value}</p>
    </div>
  );
}
