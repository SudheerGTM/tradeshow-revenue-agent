"use client";

import { useEffect, useState } from "react";
import { IdCard, Trash2, Loader2 } from "lucide-react";

interface CardRow {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: string | null;
  imageUrl: string;
  ocrStatus: string;
  ocrReviewStatus: string;
  extractedFieldsJson: string | null;
  createdAt: string;
  retentionDeleteAt: string | null;
  uploadedByName: string | null;
}

export function BusinessCardGallery({ leadId }: { leadId: string }) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { fetchCards(); }, [leadId]);

  async function fetchCards() {
    setLoading(true);
    try {
      const res = await fetch(`/api/business-cards?lead_id=${leadId}`);
      if (res.ok) setCards(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch("/api/business-cards/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessCardImageId: id }),
    });
    if (res.ok) await fetchCards();
    setDeletingId(null);
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-[#E2E8F0]">
        <IdCard className="w-4 h-4 text-[#94A3B8]" />
        <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Business Cards</p>
      </div>

      {loading ? (
        <div className="px-4 py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
        </div>
      ) : cards.length === 0 ? (
        <p className="text-xs text-[#94A3B8] px-4 py-4">No business card scans uploaded for this lead yet.</p>
      ) : (
        <div className="divide-y divide-[#F1F5F9]">
          {cards.map((card) => {
            let fields: Record<string, string> | null = null;
            try { fields = card.extractedFieldsJson ? JSON.parse(card.extractedFieldsJson) : null; } catch { /* ignore */ }

            return (
              <div key={card.id} className="p-4 flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.imageUrl} alt="Business card" className="w-20 h-20 object-cover rounded-lg border border-[#E2E8F0] shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  {fields && (
                    <p className="text-sm text-[#0F172A] truncate">
                      {[fields.firstName, fields.lastName].filter(Boolean).join(" ")}
                      {fields.companyName ? ` · ${fields.companyName}` : ""}
                    </p>
                  )}
                  <p className="text-xs text-[#94A3B8]">
                    Uploaded {new Date(card.createdAt).toLocaleDateString()}
                    {card.uploadedByName ? ` by ${card.uploadedByName}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(card.id)}
                  disabled={deletingId === card.id}
                  className="text-[#94A3B8] hover:text-[#DC2626] transition disabled:opacity-40 shrink-0"
                  title="Delete"
                >
                  {deletingId === card.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
