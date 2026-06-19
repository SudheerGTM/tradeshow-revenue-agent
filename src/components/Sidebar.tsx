"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Mic,
  Mail,
  BarChart2,
  Settings,
  Building2,
  ChevronRight,
  ShieldCheck,
  CalendarDays,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  release: number;
  roles?: string[];  // undefined = all roles
}

const NAV: NavItem[] = [
  { href: "/dashboard",       label: "Dashboard",    icon: LayoutDashboard, release: 1 },
  { href: "/leads",           label: "Leads",        icon: Users,           release: 3 },
  { href: "/leads/new",       label: "Capture Lead", icon: UserPlus,        release: 3 },
  { href: "/events",          label: "Events",       icon: CalendarDays,    release: 3 },
  { href: "/admin/tenants",   label: "Tenants",      icon: Building2,       release: 2, roles: ["platform_admin"] },
  { href: "/admin/users",     label: "Users",        icon: ShieldCheck,     release: 2, roles: ["platform_admin", "tenant_admin", "manager"] },
  { href: "/follow-ups",      label: "Follow-ups",   icon: Mail,            release: 5 },
  { href: "/analytics",       label: "Analytics",    icon: BarChart2,       release: 5 },
  { href: "/settings/tenant", label: "Settings",     icon: Settings,        release: 2 },
];

const CURRENT_RELEASE = 4;

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();

  const visible = NAV.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      <div className="h-14 px-4 flex items-center gap-2 border-b border-gray-800">
        <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">TS</span>
        </div>
        <span className="text-white font-semibold text-sm truncate">TradeShow Agent</span>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visible.map(({ href, label, icon: Icon, release }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          const locked = release > CURRENT_RELEASE;
          return (
            <Link
              key={href}
              href={locked ? "#" : href}
              aria-disabled={locked}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-indigo-600/20 text-indigo-400"
                  : locked
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {locked && (
                <span className="text-[10px] font-medium text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                  R{release}
                </span>
              )}
              {active && !locked && <ChevronRight className="w-3 h-3 opacity-50" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-800">
        <span className="text-[11px] text-gray-500 uppercase tracking-wider">
          {role.replace("_", " ")}
        </span>
      </div>
    </aside>
  );
}
