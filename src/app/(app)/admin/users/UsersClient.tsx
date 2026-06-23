"use client";

import { useState } from "react";
import { Plus, Users, RefreshCw } from "lucide-react";
import { Badge, roleBadge, statusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Tenant, UserRole } from "@/db/schema";

interface UserRow {
  id: string; name: string; email: string;
  role: string; status: string;
  tenantId: string | null; createdAt: Date;
}

interface Props {
  initial: UserRow[];
  tenants: Tenant[];
  actorRole: string;
  actorTenantId?: string;
}

export function UsersClient({ initial, tenants, actorRole, actorTenantId }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const canCreate = actorRole === "platform_admin" || actorRole === "tenant_admin";

  async function handleToggle(user: UserRow) {
    setTogglingId(user.id);
    const newStatus = user.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated: UserRow = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    }
    setTogglingId(null);
  }

  function onCreated(user: UserRow) {
    setUsers((prev) => [user, ...prev]);
    setShowCreate(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage team members across your tenant"
        action={
          canCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition"
            >
              <Plus className="w-4 h-4" /> New User
            </button>
          ) : null
        }
      />

      {users.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <EmptyState
            icon={Users}
            title="No users yet"
            description="Create the first user for this tenant."
          />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                {canCreate && <th className="px-5 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-800/40 transition">
                  <td className="px-5 py-3.5 font-medium text-white">{u.name}</td>
                  <td className="px-5 py-3.5 text-gray-400">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={roleBadge(u.role)}>
                      {u.role.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={statusBadge(u.status)}>{u.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  {canCreate && (
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleToggle(u)}
                        disabled={togglingId === u.id}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition disabled:opacity-40"
                      >
                        {togglingId === u.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {u.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canCreate && (
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create User">
          <CreateUserForm
            onCreated={onCreated}
            tenants={tenants}
            actorRole={actorRole}
            actorTenantId={actorTenantId}
          />
        </Modal>
      )}
    </div>
  );
}

const ASSIGNABLE_ROLES: Record<string, UserRole[]> = {
  platform_admin: ["platform_admin", "tenant_admin", "manager", "booth_user"],
  tenant_admin:   ["manager", "booth_user"],
  manager:        [],
};

function CreateUserForm({
  onCreated, tenants, actorRole, actorTenantId,
}: {
  onCreated: (u: UserRow) => void;
  tenants: Tenant[];
  actorRole: string;
  actorTenantId?: string;
}) {
  const [form, setForm] = useState({
    name: "", email: "", password: "",
    role: "booth_user" as UserRole,
    tenantId: actorTenantId ?? "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const assignable = ASSIGNABLE_ROLES[actorRole] ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/users", {
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
      <Field label="Full name" value={form.name}
        onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="Jane Doe" />
      <Field label="Email" type="email" value={form.email}
        onChange={(v) => setForm((p) => ({ ...p, email: v }))} placeholder="jane@company.com" />
      <Field label="Temporary password" type="password" value={form.password}
        onChange={(v) => setForm((p) => ({ ...p, password: v }))} placeholder="••••••••" />

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Role</label>
        <select
          value={form.role}
          onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {assignable.map((r) => (
            <option key={r} value={r}>{r.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      {actorRole === "platform_admin" && (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Tenant</label>
          <select
            value={form.tenantId}
            onChange={(e) => setForm((p) => ({ ...p, tenantId: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— select tenant —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition"
      >
        {loading ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
      />
    </div>
  );
}
