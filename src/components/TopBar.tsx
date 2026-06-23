"use client";

import { signOut } from "next-auth/react";
import { LogOut, Bell } from "lucide-react";

interface Props {
  user: { name?: string | null; email?: string | null; role: string; tenantId?: string };
  tenantName?: string;
}

export function TopBar({ user, tenantName }: Props) {
  return (
    <header className="h-14 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-3 sm:px-6 shrink-0 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        {tenantName ? (
          <span className="text-xs font-medium text-[#0F4C81] bg-[#dbeafe] px-2.5 py-1 rounded-lg truncate">
            {tenantName}
          </span>
        ) : (
          <span className="text-xs font-medium text-[#00B8D9] bg-[#e6f8fc] px-2.5 py-1 rounded-lg truncate">
            Platform Admin
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <button
          aria-label="Notifications"
          className="text-[#94A3B8] hover:text-[#475569] w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-[#F8FAFC] transition"
        >
          <Bell className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-[#0F4C81] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="text-[#475569] hidden lg:block text-sm font-medium truncate max-w-[140px]">{user.name}</span>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className="text-[#94A3B8] hover:text-[#DC2626] w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
