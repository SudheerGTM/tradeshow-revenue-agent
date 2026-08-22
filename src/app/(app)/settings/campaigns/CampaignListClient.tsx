"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Megaphone, Target, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { Campaign } from "@/db/schema";

type CampaignRow = Campaign & { icpCount: number; eventCount: number };

const STATUS_BADGE: Record<string, "gray" | "green" | "yellow" | "blue"> = {
  draft: "yellow",
  active: "green",
  completed: "blue",
  archived: "gray",
};

export function CampaignListClient({ initialCampaigns }: { initialCampaigns: CampaignRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function createCampaign() {
    if (!newName.trim()) return;
    setBusy("create");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create");
      const created = await res.json();
      toast.success("Campaign created — draft");
      router.push(`/settings/campaigns/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setBusy(null);
      setCreating(false);
    }
  }

  async function toggleActive(campaign: CampaignRow) {
    setBusy(campaign.id);
    const endpoint = campaign.status === "active" ? "archive" : "activate";
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/${endpoint}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const updated = await res.json();
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, ...updated } : c)));
      toast.success(endpoint === "activate" ? "Activated" : "Archived");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create a Campaign to target multiple ICPs across several events at once — or skip this and assign ICPs to events directly."
        />
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm divide-y divide-[#F1F5F9]">
          {campaigns.map((c) => (
            <div key={c.id} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/settings/campaigns/${c.id}`} className="text-sm font-semibold text-[#0F172A] hover:text-[#00B8D9] truncate">
                    {c.name}
                  </Link>
                  <Badge variant={STATUS_BADGE[c.status] ?? "gray"}>{c.status}</Badge>
                </div>
                {c.description && <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{c.description}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-[#94A3B8]">
                  <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {c.icpCount} ICP{c.icpCount === 1 ? "" : "s"}</span>
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {c.eventCount} event{c.eventCount === 1 ? "" : "s"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleActive(c)}
                  disabled={busy === c.id}
                  loading={busy === c.id}
                >
                  {c.status === "active" ? "Archive" : "Activate"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[#94A3B8]">
        A prospect may match any ICP assigned to a Campaign. Events with their own ICPs use those instead; Campaign ICPs are the fallback for events that belong to this Campaign but have none of their own.
      </p>

      <Modal open={creating} onClose={() => setCreating(false)} title="New Campaign">
        <div className="space-y-4">
          <Input label="Name" placeholder="e.g. European Logistics Growth" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Textarea label="Description (optional)" placeholder="Short internal description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={createCampaign} disabled={!newName.trim()} loading={busy === "create"}>Create Draft</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
