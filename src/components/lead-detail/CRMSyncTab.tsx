"use client";

import { CRMSyncPanel } from "@/components/CRMSyncPanel";

export function CRMSyncTab({ leadId, userRole }: { leadId: string; userRole: string }) {
  return (
    <div className="max-w-2xl">
      <CRMSyncPanel leadId={leadId} userRole={userRole} />
    </div>
  );
}
