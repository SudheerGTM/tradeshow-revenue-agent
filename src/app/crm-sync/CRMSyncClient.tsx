"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type SyncStatus = "pending_approval" | "approved" | "queued" | "processing" | "completed" | "failed";

interface QueueRow {
  id: string;
  leadId: string;
  leadFirstName: string;
  leadLastName: string | null;
  companyName: string;
  syncType: string;
  syncStatus: SyncStatus;
  approverName: string | null;
  score: number | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_VARIANT: Record<SyncStatus, "gray" | "blue" | "yellow" | "green" | "red"> = {
  pending_approval: "gray", approved: "blue", queued: "blue",
  processing: "yellow", completed: "green", failed: "red",
};

const STATUS_LABEL: Record<SyncStatus, string> = {
  pending_approval: "Pending Approval", approved: "Approved", queued: "Queued",
  processing: "Processing", completed: "Completed", failed: "Failed",
};

type FilterKey = "" | "pending_approval" | "approved" | "completed" | "failed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "",                 label: "All" },
  { key: "pending_approval", label: "Pending Approval" },
  { key: "approved",         label: "Approved" },
  { key: "completed",        label: "Completed" },
  { key: "failed",           label: "Failed" },
];

export function CRMSyncClient({ userRole }: { userRole: string }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    const res = await fetch(`/api/crm-sync?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">CRM Sync Queue</h1>
        <p className="text-sm text-[#475569] mt-0.5">
          HubSpot sync jobs awaiting approval and execution.
          {userRole === "platform_admin" && " Read-only visibility across tenants."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-xl border transition font-medium ${
              filter === f.key
                ? "bg-[#0F4C81] border-[#0F4C81] text-white"
                : "border-[#E2E8F0] text-[#475569] bg-white hover:border-[#CBD5E1]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="divide-y divide-[#F8FAFC]">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4">
                {[...Array(6)].map((__, j) => (
                  <div key={j} className="h-4 bg-[#F1F5F9] rounded animate-pulse flex-1" />
                ))}
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={RefreshCw}
            title="No CRM sync jobs found"
            description="Prepare a CRM sync from a lead's detail page to see it here."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs text-[#94A3B8] uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Lead</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Company</th>
                <th className="px-5 py-3 font-medium">Score</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Sync Type</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Approved By</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Created</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F8FAFC]">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-[#F8FAFC] transition">
                  <td className="px-5 py-3.5">
                    <Link href={`/leads/${row.leadId}`} className="font-medium text-[#0F172A] hover:text-[#0F4C81] transition">
                      {row.leadFirstName} {row.leadLastName ?? ""}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-[#475569] hidden md:table-cell">{row.companyName}</td>
                  <td className="px-5 py-3.5">
                    {row.score != null ? (
                      <span className="text-sm font-semibold text-[#0F172A]">{Math.round(row.score)}</span>
                    ) : <span className="text-xs text-[#CBD5E1]">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-[#475569] text-xs hidden lg:table-cell capitalize">{row.syncType.replace("_", " ")}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={STATUS_VARIANT[row.syncStatus]}>{STATUS_LABEL[row.syncStatus]}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden md:table-cell">{row.approverName ?? "—"}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden md:table-cell">{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">{new Date(row.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
