"use client";

import { Paperclip, IdCard } from "lucide-react";
import { VoiceRecorder } from "@/components/VoiceRecorder";

export function VoiceFilesTab({ leadId }: { leadId: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <VoiceRecorder leadId={leadId} />
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 space-y-2">
          <div className="flex items-center gap-2">
            <IdCard className="w-4 h-4 text-[#94A3B8]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Business Cards</p>
          </div>
          <p className="text-xs text-[#94A3B8]">No business card scans uploaded for this lead yet.</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-[#94A3B8]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Booth Assets</p>
          </div>
          <p className="text-xs text-[#94A3B8]">Future releases will support attaching booth photos, brochures, and other event assets here.</p>
        </div>
      </div>
    </div>
  );
}
