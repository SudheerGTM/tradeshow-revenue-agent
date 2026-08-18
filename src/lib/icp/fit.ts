/**
 * Default (hardcoded) industry-fit heuristic — Release 14.2 extraction.
 *
 * Before this file existed, this exact check was independently duplicated in
 * src/lib/agents/lead-scoring.ts (the Company Fit scoring bonus) and
 * src/components/lead-detail/CompanyIntelTab.tsx (the "ICP Match" card's
 * Industry Fit label) — with two slightly different keyword lists that had
 * already drifted apart (the UI's list additionally matched "shipping" and
 * "warehous[e]", which never affected the actual score). Both now import
 * this single function instead. See docs/RELEASE-14-CONFIGURABLE-ICP.md § A3/E.
 *
 * This remains the fixed default used when no ICP context resolves for a
 * tenant/event (see src/lib/icp/icp-resolver.ts). Making this configurable
 * per-tenant is Release 14.5's job (ICP-Aware Scoring) — explicitly deferred,
 * not done here.
 */

const DEFAULT_TARGET_INDUSTRY_KEYWORDS = ["logistics", "transport", "supply chain", "freight"];

export type IndustryFitLevel = "unknown" | "strong" | "moderate";

export function deriveDefaultIndustryFit(industry: string | null | undefined): IndustryFitLevel {
  if (!industry) return "unknown";
  const normalized = industry.toLowerCase();
  return DEFAULT_TARGET_INDUSTRY_KEYWORDS.some((k) => normalized.includes(k)) ? "strong" : "moderate";
}

export function matchesDefaultTargetIndustry(industry: string | null | undefined): boolean {
  return deriveDefaultIndustryFit(industry) === "strong";
}
