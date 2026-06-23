// Display-only role visualization. Internal role values (platform_admin,
// tenant_admin, manager, booth_user) are unchanged — this only affects
// how they're rendered.

const ROLE_DISPLAY: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  platform_admin: { emoji: "🛡️", label: "Platform Admin", bg: "#e6f8fc", text: "#00B8D9" },
  tenant_admin:   { emoji: "👑", label: "Tenant Admin",    bg: "#dbeafe", text: "#0F4C81" },
  manager:        { emoji: "📊", label: "Manager",         bg: "#fef3c7", text: "#d97706" },
  booth_user:     { emoji: "🎪", label: "Booth User",      bg: "#dcfce7", text: "#16A34A" },
};

export function RoleBadge({ role, className = "" }: { role: string; className?: string }) {
  const d = ROLE_DISPLAY[role] ?? { emoji: "👤", label: role.replace(/_/g, " "), bg: "#f1f5f9", text: "#64748B" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg whitespace-nowrap ${className}`}
      style={{ background: d.bg, color: d.text }}
    >
      <span aria-hidden="true">{d.emoji}</span> {d.label}
    </span>
  );
}
