"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { NAV, CURRENT_RELEASE } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function MobileNavDrawer({ open, onClose, role }: { open: boolean; onClose: () => void; role: string }) {
  const pathname = usePathname();
  const visible = NAV.filter((item) => !item.roles || item.roles.includes(role));

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50">
      <button
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-xl flex flex-col">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#E2E8F0] shrink-0">
          <p className="text-sm font-semibold text-[#0F172A]">Menu</p>
          <button onClick={onClose} aria-label="Close menu" className="text-[#94A3B8] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
          {visible.map(({ href, label, icon: Icon, release }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            const locked = release > CURRENT_RELEASE;
            return (
              <Link
                key={href}
                href={locked ? "#" : href}
                onClick={!locked ? onClose : undefined}
                aria-disabled={locked}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl text-sm min-h-[44px] transition",
                  active ? "bg-[#dbeafe] text-[#0F4C81] font-medium"
                  : locked ? "text-[#CBD5E1] cursor-not-allowed"
                  : "text-[#475569] hover:bg-[#F8FAFC]"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {locked && <span className="text-[10px] font-semibold text-[#CBD5E1] bg-[#F1F5F9] px-1.5 py-0.5 rounded">R{release}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
