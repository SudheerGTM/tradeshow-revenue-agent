"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, Users, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Badge, statusBadge, roleBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import type { Event } from "@/db/schema";

const LEAD_STATUS_COLORS: Record<string, "blue" | "yellow" | "green" | "red"> = {
  new: "blue", contacted: "yellow", qualified: "green", disqualified: "red",
};

interface LeadRow {
  id: string; firstName: string; lastName: string | null;
  jobTitle: string | null; companyName: string;
  email: string | null; phone: string | null;
  status: string; source: string; eventId: string | null; createdAt: string;
}

export function LeadsClient({ events }: { events: Event[] }) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (eventFilter) params.set("eventId", eventFilter);
    const res = await fetch(`/api/leads?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setHasMore(data.leads.length === data.limit);
    }
    setLoading(false);
  }, [search, statusFilter, eventFilter, page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, statusFilter, eventFilter]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Leads</h1>
          <p className="text-sm text-gray-400 mt-0.5">All contacts captured at your events</p>
        </div>
        <Link href="/leads/new">
          <Button><Plus className="w-4 h-4" /> Capture Lead</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email…"
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          {["new", "contacted", "qualified", "disqualified"].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Events</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-800">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4">
                {[...Array(4)].map((__, j) => (
                  <div key={j} className="h-4 bg-gray-800 rounded animate-pulse flex-1" />
                ))}
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads found"
            description={search || statusFilter || eventFilter
              ? "Try adjusting your filters."
              : "Capture your first lead from the show floor."}
            action={
              <Link href="/leads/new">
                <button className="text-sm text-indigo-400 hover:text-indigo-300">Capture lead →</button>
              </Link>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Job Title</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Email</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Phone</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Captured</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-800/40 transition">
                  <td className="px-5 py-3.5">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-white hover:text-indigo-400 transition">
                      {lead.firstName} {lead.lastName ?? ""}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-gray-300">{lead.companyName}</td>
                  <td className="px-5 py-3.5 text-gray-400 hidden md:table-cell">{lead.jobTitle ?? "—"}</td>
                  <td className="px-5 py-3.5 text-gray-400 hidden lg:table-cell">{lead.email ?? "—"}</td>
                  <td className="px-5 py-3.5 text-gray-400 hidden lg:table-cell">{lead.phone ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={LEAD_STATUS_COLORS[lead.status] ?? "gray"}>
                      {lead.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs hidden md:table-cell">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
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
          <span className="text-xs text-gray-500">Page {page}</span>
          <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
            Next <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
