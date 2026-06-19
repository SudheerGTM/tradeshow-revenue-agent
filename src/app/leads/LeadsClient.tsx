"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, Users, ChevronLeft, ChevronRight, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import type { Event } from "@/db/schema";

const LEAD_STATUS_COLORS: Record<string, "blue" | "yellow" | "green" | "red"> = {
  new: "blue", contacted: "yellow", qualified: "green", disqualified: "red",
};

const SCORE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  hot:          { bg: "#fee2e2", text: "#DC2626", label: "Hot" },
  warm:         { bg: "#fef3c7", text: "#d97706", label: "Warm" },
  cold:         { bg: "#dbeafe", text: "#0F4C81", label: "Cold" },
  needs_review: { bg: "#f1f5f9", text: "#64748B", label: "Review" },
};

interface LeadRow {
  id: string; firstName: string; lastName: string | null;
  jobTitle: string | null; companyName: string;
  email: string | null; phone: string | null;
  status: string; source: string; eventId: string | null; createdAt: string;
  latestScore?: number | null;
  latestClassification?: string | null;
  expectedRevenue?: number | null;
  recommendedNextAction?: string | null;
}

export function LeadsClient({ events }: { events: Event[] }) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (eventFilter) params.set("eventId", eventFilter);
    if (classificationFilter) params.set("classification", classificationFilter);
    const res = await fetch(`/api/leads?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setHasMore(data.leads.length === data.limit);
    }
    setLoading(false);
  }, [search, statusFilter, eventFilter, classificationFilter, page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { setPage(1); }, [search, statusFilter, eventFilter, classificationFilter]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Lead Intelligence</h1>
          <p className="text-sm text-[#475569] mt-0.5">All contacts captured at your events</p>
        </div>
        <Link href="/leads/new">
          <Button><Plus className="w-4 h-4" /> Capture Lead</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email…"
            className="w-full bg-white border border-[#E2E8F0] rounded-xl pl-9 pr-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] focus:border-[#00B8D9] transition"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition"
        >
          <option value="">All Statuses</option>
          {["new", "contacted", "qualified", "disqualified"].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={classificationFilter}
          onChange={(e) => setClassificationFilter(e.target.value)}
          className="bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition"
        >
          <option value="">All Scores</option>
          <option value="hot">🔴 Hot</option>
          <option value="warm">🟡 Warm</option>
          <option value="cold">🔵 Cold</option>
          <option value="needs_review">⚪ Needs Review</option>
        </select>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition"
        >
          <option value="">All Events</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="divide-y divide-[#F8FAFC]">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4">
                {[...Array(5)].map((__, j) => (
                  <div key={j} className="h-4 bg-[#F1F5F9] rounded animate-pulse flex-1" />
                ))}
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads found"
            description={search || statusFilter || eventFilter || classificationFilter
              ? "Try adjusting your filters."
              : "Capture your first lead from the show floor."}
            action={
              <Link href="/leads/new">
                <button className="text-sm text-[#00B8D9] hover:text-[#009ab8] font-medium">Capture lead →</button>
              </Link>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs text-[#94A3B8] uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Job Title</th>
                <th className="px-5 py-3 font-medium">Score</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Expected Revenue</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Captured</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F8FAFC]">
              {leads.map((lead) => {
                const sc = lead.latestClassification ? SCORE_STYLE[lead.latestClassification] : null;
                return (
                  <tr key={lead.id} className="hover:bg-[#F8FAFC] transition">
                    <td className="px-5 py-3.5">
                      <Link href={`/leads/${lead.id}`} className="font-medium text-[#0F172A] hover:text-[#0F4C81] transition">
                        {lead.firstName} {lead.lastName ?? ""}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-[#475569]">{lead.companyName}</td>
                    <td className="px-5 py-3.5 text-[#94A3B8] hidden md:table-cell">{lead.jobTitle ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      {sc && lead.latestScore != null ? (
                        <div className="flex items-center gap-1.5">
                          <div
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold"
                            style={{ background: sc.bg, color: sc.text }}
                          >
                            <Star className="w-3 h-3" />
                            {Math.round(lead.latestScore)}
                          </div>
                          <span className="text-[11px]" style={{ color: sc.text }}>{sc.label}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-[#CBD5E1]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell text-sm font-medium text-[#0F172A]">
                      {lead.expectedRevenue != null
                        ? `£${lead.expectedRevenue.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
                        : <span className="text-[#CBD5E1]">—</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={LEAD_STATUS_COLORS[lead.status] ?? "gray"}>
                        {lead.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden md:table-cell">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </Button>
          <span className="text-xs text-[#94A3B8]">Page {page}</span>
          <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
            Next <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
