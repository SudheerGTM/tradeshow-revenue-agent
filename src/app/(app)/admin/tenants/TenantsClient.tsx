"use client";

import { useState } from "react";
import { Plus, Building2, RefreshCw } from "lucide-react";
import { Badge, roleBadge, statusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Tenant } from "@/db/schema";

export function TenantsClient({ initial }: { initial: Tenant[] }) {
  const [tenants, setTenants] = useState<Tenant[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggle(tenant: Tenant) {
    setTogglingId(tenant.id);
    const newStatus = tenant.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/tenants/${tenant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated: Tenant = await res.json();
      setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    }
    setTogglingId(null);
  }

  function onCreated(tenant: Tenant) {
    setTenants((prev) => [tenant, ...prev]);
    setShowCreate(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        description="All organizations using this platform"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> New Tenant
          </button>
        }
      />

      {tenants.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <EmptyState
            icon={Building2}
            title="No tenants yet"
            description="Create your first tenant to get started."
            action={
              <button
                onClick={() => setShowCreate(true)}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition"
              >
                Create tenant →
              </button>
            }
          />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Slug</th>
                <th className="px-5 py-3 font-medium">Subdomain</th>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-gray-800/40 transition">
                  <td className="px-5 py-3.5 font-medium text-white">{t.name}</td>
                  <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{t.slug}</td>
                  <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{t.subdomain}</td>
                  <td className="px-5 py-3.5 text-gray-400">{t.eventName ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={statusBadge(t.status)}>
                      {t.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleToggle(t)}
                      disabled={togglingId === t.id}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition disabled:opacity-40"
                    >
                      {togglingId === t.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {t.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Tenant">
        <CreateTenantForm onCreated={onCreated} />
      </Modal>
    </div>
  );
}

function CreateTenantForm({ onCreated }: { onCreated: (t: Tenant) => void }) {
  const [form, setForm] = useState({ name: "", slug: "", subdomain: "", eventName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
      return;
    }
    onCreated(await res.json());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        { label: "Name", key: "name" as const, placeholder: "Demo Logistics" },
        { label: "Slug", key: "slug" as const, placeholder: "demo-logistics" },
        { label: "Subdomain", key: "subdomain" as const, placeholder: "demo" },
        { label: "Event name (optional)", key: "eventName" as const, placeholder: "MODEX 2025" },
      ].map(({ label, key, placeholder }) => (
        <div key={key}>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
          <input
            value={form[key]}
            onChange={field(key)}
            placeholder={placeholder}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>
      ))}

      {error && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition"
        >
          {loading ? "Creating…" : "Create tenant"}
        </button>
      </div>
    </form>
  );
}
