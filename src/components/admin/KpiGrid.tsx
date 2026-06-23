import type { LucideIcon } from "lucide-react";

export interface KpiItem {
  icon: LucideIcon;
  label: string;
  value: string;
  color?: string;
  bg?: string;
}

const DEFAULT_COLOR = "#0F4C81";
const DEFAULT_BG = "#dbeafe";

// Shared executive KPI card row — used on Tenant Settings and Users pages.
// Mobile: stacks 2-up. Tablet: 3-up. Desktop: full row.
export function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {items.map((item, i) => (
        <KpiCard key={i} {...item} />
      ))}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color = DEFAULT_COLOR, bg = DEFAULT_BG }: KpiItem) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 sm:p-5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: bg }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-xl sm:text-2xl font-bold text-[#0F172A] truncate">{value}</p>
      <p className="text-xs text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  );
}
