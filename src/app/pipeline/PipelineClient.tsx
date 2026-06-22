"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

type Stage = "identified" | "qualified" | "meeting_scheduled" | "proposal_requested" | "proposal_sent" | "negotiation" | "won" | "lost";
type Priority = "high" | "medium" | "low";

interface OppRow {
  id: string;
  opportunityName: string;
  companyName: string;
  stage: Stage;
  priority: Priority;
  amount: number | null;
  expectedRevenue: number | null;
  ownerName: string | null;
}

const STAGES: { key: Stage; label: string }[] = [
  { key: "identified", label: "Identified" },
  { key: "qualified", label: "Qualified" },
  { key: "meeting_scheduled", label: "Meeting Scheduled" },
  { key: "proposal_requested", label: "Proposal Requested" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "negotiation", label: "Negotiation" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

const PRIORITY_VARIANT: Record<Priority, "red" | "yellow" | "blue"> = { high: "red", medium: "yellow", low: "blue" };

export function PipelineClient({ userRole }: { userRole: string }) {
  const [rows, setRows] = useState<OppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);

  const canDrag = userRole !== "platform_admin";

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/opportunities`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function moveToStage(id: string, stage: Stage) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, stage } : r));
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) await fetchRows(); // revert on failure by refetching
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#CBD5E1]" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Pipeline Board</h1>
        <p className="text-sm text-[#475569] mt-0.5">
          {canDrag ? "Drag a card between columns to change its stage." : "Read-only view."}
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(stageInfo => {
          const stageRows = rows.filter(r => r.stage === stageInfo.key);
          const stageValue = stageRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
          return (
            <div
              key={stageInfo.key}
              className={`w-72 shrink-0 rounded-xl border ${dragOverStage === stageInfo.key ? "border-[#00B8D9] bg-[#e6f8fc]" : "border-[#E2E8F0] bg-[#F8FAFC]"} transition`}
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(stageInfo.key); }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                if (draggingId && canDrag) moveToStage(draggingId, stageInfo.key);
                setDraggingId(null);
              }}
            >
              <div className="px-3.5 py-3 border-b border-[#E2E8F0]">
                <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">{stageInfo.label}</p>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">{stageRows.length} · £{stageValue.toLocaleString("en-GB")}</p>
              </div>
              <div className="p-2.5 space-y-2 min-h-[100px]">
                {stageRows.map(row => (
                  <Link
                    key={row.id}
                    href={`/opportunities/${row.id}`}
                    draggable={canDrag}
                    onDragStart={() => setDraggingId(row.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className={`block bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-sm hover:shadow-md transition cursor-grab ${draggingId === row.id ? "opacity-50" : ""}`}
                  >
                    <p className="text-sm font-medium text-[#0F172A] truncate">{row.opportunityName}</p>
                    <p className="text-xs text-[#94A3B8] truncate">{row.companyName}</p>
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant={PRIORITY_VARIANT[row.priority]}>{row.priority}</Badge>
                      <span className="text-xs font-semibold text-[#16A34A]">
                        {row.expectedRevenue != null ? `£${row.expectedRevenue.toLocaleString("en-GB")}` : "—"}
                      </span>
                    </div>
                    {row.ownerName && <p className="text-[10px] text-[#CBD5E1] mt-1.5">{row.ownerName}</p>}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
