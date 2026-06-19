"use client";

import { signOut } from "next-auth/react";
import { LogOut, Bell } from "lucide-react";

interface Props {
  user: { name?: string | null; email?: string | null; role: string; tenantId?: string };
  tenantName?: string;
}

export function TopBar({ user, tenantName }: Props) {
  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        {tenantName ? (
          <span className="text-xs font-medium text-gray-300 bg-gray-800 px-2 py-1 rounded">
            {tenantName}
          </span>
        ) : (
          <span className="text-xs font-medium text-indigo-400 bg-indigo-600/10 px-2 py-1 rounded">
            Platform Admin
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          aria-label="Notifications"
          className="text-gray-400 hover:text-white p-1.5 rounded-md hover:bg-gray-800 transition"
        >
          <Bell className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="text-gray-300 hidden sm:block">{user.name}</span>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className="text-gray-400 hover:text-white p-1.5 rounded-md hover:bg-gray-800 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
