"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { NAV, CURRENT_RELEASE } from "@/lib/nav";

// Visible from md (tablet) up. Mobile uses MobileBottomNav + MobileNavDrawer
// instead — see DashboardLayout.
export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const visible = NAV.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 transition-all duration-200",
        collapsed ? "w-16" : "w-16 lg:w-60"
      )}
      style={{ background: "#0F4C81", minHeight: "100vh" }}
    >
      {/* Logo */}
      <div
        className="h-14 px-3 lg:px-4 flex items-center gap-2.5 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}
      >
        {/* <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "#00B8D9" }}
        >
          <span className="text-white text-xs font-bold">TS</span>
        </div> */}

        <div
          className="relative w-8 h-8 rounded-lg shrink-0 group cursor-pointer"
          style={{ background: "#00B8D9" }}
          onClick={() => collapsed && setCollapsed(false)}
        >
          {/* Logo */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity",
              collapsed && "group-hover:opacity-0"
            )}
          >
            <span className="text-white text-xs font-bold">TS</span>
          </div>

          {/* Expand Icon */}
          {collapsed && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="hidden lg:block flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate leading-tight">Trade Show</p>
            <p className="text-[10px] truncate leading-tight" style={{ color: "rgba(255,255,255,0.55)" }}>Revenue Agent</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-white/50 hover:text-white transition shrink-0 ml-auto"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
              title={label}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all justify-center lg:justify-start",
                collapsed && "lg:justify-center",
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
                <span className="hidden lg:flex flex-1 truncate items-center justify-between gap-2">
                  <span className="truncate">{label}</span>
                  {locked && (
                    <span className="text-[9px] font-semibold text-white/30 bg-white/10 px-1.5 py-0.5 rounded shrink-0">
                      R{release}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Role footer */}
      <div
        className="p-3 shrink-0 flex justify-center lg:justify-start"
        style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}
      >
        {collapsed ? (
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold uppercase">{role[0]}</span>
          </div>
        ) : (
          <>
            <div className="lg:hidden w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold uppercase">{role[0]}</span>
            </div>
            <span className="hidden lg:inline text-[11px] uppercase tracking-wider font-medium text-white/40">
              {role.replace(/_/g, " ")}
            </span>
          </>
        )}
      </div>
    </aside>
  );
}
