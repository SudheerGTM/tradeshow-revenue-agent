"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Mail, Link2, CalendarClock, Phone, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type FollowupType = "email" | "linkedin" | "meeting_request" | "phone_call";
type Priority = "high" | "medium" | "low";
type Status = "draft" | "approved" | "rejected";

interface QueueRow {
  id: string;
  leadId: string;
  leadFirstName: string;
  leadLastName: string | null;
  companyName: string;
  followupType: FollowupType;
  priority: Priority;
  recommendedTiming: string;
  status: Status;
  confidenceScore: number | null;
  needsHumanReview: boolean;
  createdAt: string;
  score: number | null;
  classification: string | null;
}

const TYPE_META: Record<FollowupType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  email:            { label: "Email",           icon: Mail },
  linkedin:         { label: "LinkedIn",         icon: Link2 },
  meeting_request:  { label: "Meeting Request",  icon: CalendarClock },
  phone_call:       { label: "Phone Call",       icon: Phone },
};

const PRIORITY_VARIANT: Record<Priority, "red" | "yellow" | "blue"> = {
  high: "red", medium: "yellow", low: "blue",
};

const STATUS_VARIANT: Record<Status, "gray" | "green" | "red"> = {
  draft: "gray", approved: "green", rejected: "red",
};

const TIMING_LABEL: Record<string, string> = {
  immediate: "Immediate", "24_hours": "24 Hours", "3_days": "3 Days",
  "1_week": "1 Week", "2_weeks": "2 Weeks",
};

type FilterKey = "" | "high_priority" | "needs_review" | "hot_leads" | "approved" | "rejected";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "",              label: "All" },
  { key: "high_priority", label: "High Priority" },
  { key: "needs_review",  label: "Needs Review" },
  { key: "hot_leads",     label: "Hot Leads" },
  { key: "approved",      label: "Approved" },
  { key: "rejected",      label: "Rejected" },
];

export function FollowUpsClient({ userRole }: { userRole: string }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter === "high_priority") params.set("priority", "high");
    if (filter === "hot_leads") params.set("classification", "hot");
    if (filter === "approved") params.set("status", "approved");
    if (filter === "rejected") params.set("status", "rejected");

    const res = await fetch(`/api/followups?${params}`);
    if (res.ok) {
      let data: QueueRow[] = await res.json();
      if (filter === "needs_review") data = data.filter(r => r.needsHumanReview);
      setRows(data);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Follow-Up Queue</h1>
        <p className="text-sm text-[#475569] mt-0.5">
          AI-generated outreach drafts awaiting review. {userRole === "booth_user" ? "Showing your leads." : "All tenant drafts."}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-2 rounded-xl border transition font-medium whitespace-nowrap shrink-0 min-h-[36px] ${
              filter === f.key
                ? "bg-[#0F4C81] border-[#0F4C81] text-white"
                : "border-[#E2E8F0] text-[#475569] bg-white hover:border-[#CBD5E1]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
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
            icon={Inbox}
            title="No follow-up drafts found"
            description="Generate a lead score and follow-up draft from a lead's detail page to see it here."
          />
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-[#F8FAFC]">
              {rows.map(row => {
                const meta = TYPE_META[row.followupType];
                return (
                  <Link key={row.id} href={`/leads/${row.leadId}`} className="block p-4 active:bg-[#F8FAFC]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[#0F172A] truncate">{row.leadFirstName} {row.leadLastName ?? ""}</p>
                        <p className="text-xs text-[#475569] truncate mt-0.5">{row.companyName}</p>
                      </div>
                      <Badge variant={PRIORITY_VARIANT[row.priority]} className="shrink-0">{row.priority}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-xs text-[#475569]">
                      <span className="flex items-center gap-1"><meta.icon className="w-3.5 h-3.5" /> {meta.label}</span>
                      <span>{TIMING_LABEL[row.recommendedTiming] ?? row.recommendedTiming}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                        {row.needsHumanReview && <span className="text-[10px] text-[#d97706] font-medium">Needs Review</span>}
                      </div>
                      {row.score != null && <span className="text-sm font-semibold text-[#0F172A]">Score {Math.round(row.score)}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Tablet/Desktop: table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs text-[#94A3B8] uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Company</th>
                  <th className="px-5 py-3 font-medium">Score</th>
                  <th className="px-5 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Type</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Timing</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Confidence</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F8FAFC]">
                {rows.map(row => {
                  const meta = TYPE_META[row.followupType];
                  return (
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
                      <td className="px-5 py-3.5">
                        <Badge variant={PRIORITY_VARIANT[row.priority]}>{row.priority}</Badge>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-[#475569]">
                          <meta.icon className="w-3.5 h-3.5" />
                          <span className="text-xs">{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">
                        {TIMING_LABEL[row.recommendedTiming] ?? row.recommendedTiming}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                        {row.needsHumanReview && (
                          <span className="ml-1.5 text-[10px] text-[#d97706] font-medium">Review</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">
                        {row.confidenceScore != null ? `${Math.round(row.confidenceScore)}%` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
