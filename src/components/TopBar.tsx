"use client";

import { signOut } from "next-auth/react";
import { LogOut, Bell } from "lucide-react";

interface Props {
  user: { name?: string | null; email?: string | null; role: string; tenantId?: string };
  tenantName?: string;
}

export function TopBar({ user, tenantName }: Props) {
  return (
    <header className="h-14 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6 shrink-0 shadow-sm">
      <div className="flex items-center gap-2">
        {tenantName ? (
          <span className="text-xs font-medium text-[#0F4C81] bg-[#dbeafe] px-2.5 py-1 rounded-lg">
            {tenantName}
          </span>
        ) : (
          <span className="text-xs font-medium text-[#00B8D9] bg-[#e6f8fc] px-2.5 py-1 rounded-lg">
            Platform Admin
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          aria-label="Notifications"
          className="text-[#94A3B8] hover:text-[#475569] p-1.5 rounded-lg hover:bg-[#F8FAFC] transition"
        >
          <Bell className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-[#0F4C81] flex items-center justify-center text-white text-xs font-bold">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="text-[#475569] hidden sm:block text-sm font-medium">{user.name}</span>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className="text-[#94A3B8] hover:text-[#DC2626] p-1.5 rounded-lg hover:bg-[#fee2e2] transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
