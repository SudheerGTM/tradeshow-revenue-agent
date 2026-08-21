"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Structured multi-value input for one ICPConfig string-list field (e.g.
 * targetIndustries, decisionMakerTitles). Deliberately not a raw-JSON
 * textarea — per the R14.3 brief, admins should never have to hand-edit
 * JSON to configure an ICP.
 */
export function TagListField({
  label,
  description,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  }

  function remove(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  return (
    <div>
      <label className="block text-xs font-medium text-[#475569] mb-1">{label}</label>
      {description && <p className="text-xs text-[#94A3B8] mb-1.5">{description}</p>}
      <div className="w-full bg-white border border-[#E2E8F0] rounded-xl px-2.5 py-2 flex flex-wrap gap-1.5 focus-within:ring-2 focus-within:ring-[#00B8D9] focus-within:border-[#00B8D9]">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 bg-[#e6f8fc] text-[#0F4C81] text-xs font-medium rounded-lg px-2 py-1">
            {v}
            <button type="button" onClick={() => remove(v)} className="hover:text-[#DC2626]" aria-label={`Remove ${v}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
            if (e.key === "Backspace" && !draft && values.length) remove(values[values.length - 1]);
          }}
          onBlur={commit}
          placeholder={values.length ? "" : (placeholder ?? "Type and press Enter")}
          className="flex-1 min-w-[120px] text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none py-1"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name={`icp-tag-draft-${label.replace(/\s+/g, "-").toLowerCase()}`}
        />
      </div>
    </div>
  );
}
