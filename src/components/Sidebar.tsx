"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Brain,
  Building2,
  Star,
  Mail,
  RefreshCw,
  BarChart2,
  Settings,
  ShieldCheck,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  release: number;
  roles?: string[];
  section?: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard",          label: "Dashboard",               icon: LayoutDashboard, release: 1 },
  { href: "/events",             label: "Events",                  icon: CalendarDays,    release: 3 },
  { href: "/leads",              label: "Lead Intelligence",       icon: Users,           release: 3 },
  { href: "/leads/new",          label: "Capture Lead",            icon: UserPlus,        release: 3 },
  { href: "/conversation-intel", label: "Conversation Intelligence", icon: Brain,         release: 6 },
  { href: "/company-intel",      label: "Company Intelligence",    icon: Building2,       release: 7 },
  { href: "/lead-scoring",       label: "Lead Scoring",            icon: Star,            release: 8 },
  { href: "/followups",          label: "Follow-Ups",              icon: Mail,            release: 9 },
  { href: "/crm-sync",           label: "CRM Sync",                icon: RefreshCw,       release: 10 },
  { href: "/roi-analytics",      label: "ROI Analytics",           icon: BarChart2,       release: 11 },
  { href: "/admin/tenants",      label: "Tenants",                 icon: Zap,             release: 2, roles: ["platform_admin"] },
  { href: "/admin/users",        label: "Users",                   icon: ShieldCheck,     release: 2, roles: ["platform_admin", "tenant_admin", "manager"] },
  { href: "/settings/tenant",    label: "Settings",                icon: Settings,        release: 2 },
];

const CURRENT_RELEASE = 10;

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const visible = NAV.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  return (
    <aside
      className={cn(
        "flex flex-col shrink-0 transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
      style={{ background: "#0F4C81", minHeight: "100vh" }}
    >
      {/* Logo */}
      <div
        className="h-14 px-4 flex items-center gap-2.5 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "#00B8D9" }}
        >
          <span className="text-white text-xs font-bold">TS</span>
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate leading-tight">Trade Show</p>
            <p className="text-[10px] truncate leading-tight" style={{ color: "rgba(255,255,255,0.55)" }}>Revenue Agent</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-white/50 hover:text-white transition shrink-0 ml-auto"
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft className="w-4 h-4" />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visible.map(({ href, label, icon: Icon, release }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          const locked = release > CURRENT_RELEASE;
          return (
            <Link
              key={href}
              href={locked ? "#" : href}
              aria-disabled={locked}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all",
                collapsed ? "justify-center" : "",
                active
                  ? "text-white font-medium"
                  : locked
                  ? "cursor-not-allowed opacity-40"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              )}
              style={active ? { background: "#00B8D9" } : undefined}
            >
              <Icon className="w-4 h-4 shrink-0 text-white" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{label}</span>
                  {locked && (
                    <span className="text-[9px] font-semibold text-white/30 bg-white/10 px-1.5 py-0.5 rounded">
                      R{release}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Role footer */}
      <div
        className="p-3 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}
      >
        {collapsed ? (
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold uppercase">{role[0]}</span>
          </div>
        ) : (
          <span className="text-[11px] uppercase tracking-wider font-medium text-white/40">
            {role.replace(/_/g, " ")}
          </span>
        )}
      </div>
    </aside>
  );
}
