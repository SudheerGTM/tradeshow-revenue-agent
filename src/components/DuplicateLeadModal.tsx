"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface DuplicateMatch {
  id: string;
  firstName: string;
  lastName: string | null;
  companyName: string;
  email: string | null;
}

interface Props {
  open: boolean;
  match: DuplicateMatch | null;
  onViewExisting: () => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}

export function DuplicateLeadModal({ open, match, onViewExisting, onCreateAnyway, onCancel }: Props) {
  return (
    <Modal open={open} onClose={onCancel} title="Potential Duplicate Found">
      {match && (
        <div className="space-y-4">
          <p className="text-sm text-[#475569]">
            A lead with similar details already exists for this tenant:
          </p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
            <p className="text-sm font-medium text-[#0F172A]">
              {[match.firstName, match.lastName].filter(Boolean).join(" ")}
            </p>
            <p className="text-xs text-[#475569]">{match.companyName}</p>
            {match.email && <p className="text-xs text-[#94A3B8]">{match.email}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={onViewExisting} className="w-full">View Existing Lead</Button>
            <Button variant="secondary" onClick={onCreateAnyway} className="w-full">Create New Lead Anyway</Button>
            <Button variant="ghost" onClick={onCancel} className="w-full">Cancel</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
