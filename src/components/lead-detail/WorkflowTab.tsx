"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, PlayCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { WorkflowStepList, type ExecutionRow } from "@/components/workflow/WorkflowStepList";

type WorkflowStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

interface WorkflowRun {
  id: string;
  status: WorkflowStatus;
  currentStep: number;
  totalSteps: number;
  createdAt: string;
}

const STATUS_VARIANT: Record<WorkflowStatus, "blue" | "yellow" | "green" | "red" | "gray"> = {
  queued: "gray", running: "yellow", completed: "green", failed: "red", cancelled: "gray",
};

export function WorkflowTab({ leadId }: { leadId: string }) {
  const toast = useToast();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/workflows?lead_id=${leadId}`);
    if (res.ok) {
      const rows: WorkflowRun[] = await res.json();
      if (rows.length) {
        setRun(rows[0]);
        const detailRes = await fetch(`/api/workflows/${rows[0].id}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          setExecutions(detail.executions);
        }
      }
    }
    setLoading(false);
  }, [leadId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleStart() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/workflows/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start workflow");
      toast.success("Lead Qualification Workflow started");
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start workflow";
      setError(message);
      toast.error(message);
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[#CBD5E1]" /></div>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0F172A]">Lead Qualification Workflow</p>
            {run && <p className="text-xs text-[#94A3B8] mt-0.5">{run.currentStep}/{run.totalSteps} steps</p>}
          </div>
          {run && <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>}
        </div>

        {error && <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{error}</p>}

        {!run ? (
          <>
            <p className="text-xs text-[#94A3B8]">
              Runs Conversation Intelligence → Company Enrichment → Lead Scoring → Follow-Up Intelligence → CRM Recommendation → ROI Attribution in sequence.
            </p>
            <Button onClick={handleStart} loading={starting} className="w-full">
              <PlayCircle className="w-4 h-4" /> Start Workflow
            </Button>
          </>
        ) : (
          <>
            <WorkflowStepList executions={executions} compact />
            <div className="flex gap-2 pt-1">
              <Button onClick={handleStart} loading={starting} variant="secondary" size="sm" className="flex-1">Run Again</Button>
              <Link href={`/workflows/${run.id}`} className="flex-1">
                <Button variant="secondary" size="sm" className="w-full">
                  Full Details <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
