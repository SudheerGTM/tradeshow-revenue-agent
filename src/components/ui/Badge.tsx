import { cn } from "@/lib/utils";

type Variant = "green" | "red" | "yellow" | "blue" | "gray" | "turquoise";

const variants: Record<Variant, string> = {
  green:     "bg-[#dcfce7] text-[#16A34A] ring-1 ring-[#16A34A]/20",
  red:       "bg-[#fee2e2] text-[#DC2626] ring-1 ring-[#DC2626]/20",
  yellow:    "bg-[#fef3c7] text-[#d97706] ring-1 ring-[#F59E0B]/20",
  blue:      "bg-[#dbeafe] text-[#0F4C81] ring-1 ring-[#0F4C81]/20",
  turquoise: "bg-[#e6f8fc] text-[#00B8D9] ring-1 ring-[#00B8D9]/20",
  gray:      "bg-slate-100 text-[#475569] ring-1 ring-slate-200",
};

export function Badge({
  children,
  variant = "gray",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function roleBadge(role: string) {
  const map: Record<string, Variant> = {
    platform_admin: "blue",
    tenant_admin:   "turquoise",
    manager:        "yellow",
    booth_user:     "gray",
  };
  return map[role] ?? "gray";
}

export function statusBadge(status: string): Variant {
  const map: Record<string, Variant> = {
    active:    "green",
    invited:   "blue",
    inactive:  "gray",
    suspended: "yellow",
    locked:    "red",
    expired:   "gray",
    cancelled: "gray",
  };
  return map[status] ?? "red";
}
