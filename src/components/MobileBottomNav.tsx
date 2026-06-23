"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, UserPlus, Mail, Menu } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MobileNavDrawer } from "./MobileNavDrawer";

const ITEMS = [
  { href: "/dashboard", label: "Home",     icon: LayoutDashboard },
  { href: "/leads",     label: "Leads",    icon: Users },
  { href: "/leads/new", label: "Capture",  icon: UserPlus, accent: true },
  { href: "/followups", label: "Follow-Up", icon: Mail },
];

// Mobile-only fixed bottom bar (<md). Pairs with MobileNavDrawer for the
// full nav list via the "More" button. Sits above safe-area inset so it
// doesn't get clipped by the home indicator on iOS.
export function MobileBottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E2E8F0] flex items-stretch shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {ITEMS.map(({ href, label, icon: Icon, accent }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href) && href !== "/leads/new");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition",
                active ? "text-[#0F4C81]" : "text-[#94A3B8]"
              )}
            >
              {accent ? (
                <span className="w-9 h-9 rounded-full bg-[#0F4C81] flex items-center justify-center -mt-4 shadow-md">
                  <Icon className="w-4 h-4 text-white" />
                </span>
              ) : (
                <Icon className="w-5 h-5" />
              )}
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[#94A3B8]"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} role={role} />
    </>
  );
}
