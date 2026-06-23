"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";

type Category = "booth" | "travel" | "hotel" | "marketing" | "sponsorship" | "staff" | "collateral" | "other";

const CATEGORY_LABEL: Record<Category, string> = {
  booth: "Booth", travel: "Travel", hotel: "Hotel / Accommodation", marketing: "Marketing",
  sponsorship: "Sponsorship", staff: "Staff", collateral: "Collateral", other: "Other",
};

interface CostRow {
  id: string; costCategory: Category; description: string | null; amount: number; createdAt: string; createdByName: string | null;
}

export function EventCostsClient({ eventId, eventName, canEdit }: { eventId: string; eventName: string; canEdit: boolean }) {
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<{ costCategory: Category; description: string; amount: string }>({
    costCategory: "booth", description: "", amount: "",
  });

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/costs`);
    if (res.ok) {
      const data = await res.json();
      setCosts(data.costs);
      setTotal(data.total);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchCosts(); }, [fetchCosts]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) { setError("Enter a valid amount"); return; }

    setAdding(true);
    try {
      const res = await fetch(`/api/events/${eventId}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costCategory: form.costCategory, description: form.description || undefined, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add cost");
      setForm({ costCategory: "booth", description: "", amount: "" });
      await fetchCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add cost");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(costId: string) {
    const res = await fetch(`/api/events/${eventId}/costs/${costId}`, { method: "DELETE" });
    if (res.ok) await fetchCosts();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start gap-4">
        <Link href="/events" className="text-[#94A3B8] hover:text-[#475569] mt-0.5 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Event Costs</h1>
          <p className="text-sm text-[#475569] mt-0.5">{eventName}</p>
        </div>
      </div>

      {/* Total */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#dbeafe] flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#0F4C81]" />
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Total Event Cost</p>
            <p className="text-2xl font-bold text-[#0F172A]">£{total.toLocaleString("en-GB")}</p>
          </div>
        </div>
      </div>

      {/* Add cost form */}
      {canEdit && (
        <form onSubmit={handleAdd} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Add Cost</p>
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={form.costCategory}
              onChange={(e) => setForm(p => ({ ...p, costCategory: e.target.value as Category }))}
            >
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Input
              type="number"
              placeholder="Amount (£)"
              value={form.amount}
              onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
            />
          </div>
          <Input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
          />
          {error && <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{error}</p>}
          <Button type="submit" loading={adding} className="w-full">
            <Plus className="w-4 h-4" /> Add Cost
          </Button>
        </form>
      )}

      {/* Cost list */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-5"><div className="h-20 bg-[#F1F5F9] rounded animate-pulse" /></div>
        ) : costs.length === 0 ? (
          <EmptyState icon={DollarSign} title="No costs recorded yet" description="Add booth, travel, marketing or other costs to calculate ROI." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs text-[#94A3B8] uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Added By</th>
                {canEdit && <th className="px-5 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F8FAFC]">
              {costs.map(c => (
                <tr key={c.id} className="hover:bg-[#F8FAFC] transition">
                  <td className="px-5 py-3.5"><Badge variant="blue">{CATEGORY_LABEL[c.costCategory]}</Badge></td>
                  <td className="px-5 py-3.5 text-[#475569]">{c.description ?? "—"}</td>
                  <td className="px-5 py-3.5 font-medium text-[#0F172A]">£{c.amount.toLocaleString("en-GB")}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden md:table-cell">{c.createdByName ?? "—"}</td>
                  {canEdit && (
                    <td className="px-5 py-3.5 text-right">
                      <button onClick={() => handleDelete(c.id)} className="text-[#CBD5E1] hover:text-[#DC2626] transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
