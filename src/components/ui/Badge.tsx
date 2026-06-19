import { cn } from "@/lib/utils";

type Variant = "green" | "red" | "yellow" | "blue" | "gray";

const variants: Record<Variant, string> = {
  green:  "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  red:    "bg-red-500/10    text-red-400    ring-1 ring-red-500/20",
  yellow: "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20",
  blue:   "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20",
  gray:   "bg-gray-500/10   text-gray-400   ring-1 ring-gray-500/20",
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
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
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
    tenant_admin:   "green",
    manager:        "yellow",
    booth_user:     "gray",
  };
  return map[role] ?? "gray";
}

export function statusBadge(status: string): Variant {
  return status === "active" ? "green" : "red";
}
