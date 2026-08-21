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

// ─── ICP Test Mode — qualitative criteria matching (Release 14.3) ─────────
//
// Per the R14.3 approval: Test Mode must NOT be a second numeric scoring
// engine that could disagree with the real Lead Scoring model once R14.5
// wires ICP context into it. This stays in fit.ts (the one shared ICP-fit
// module) rather than a separate preview.ts, and produces qualitative
// matched/missing/negative/unknown criteria only — no score, no points, no
// weighted formula. See docs/RELEASE-14.3-ICP-ADMIN.md.

import type { ICPConfig } from "./schema";

export interface ICPTestSampleInput {
  companyName?: string;
  industry?: string;
  country?: string;
  employeeCount?: number;
  jobTitle?: string;
  notes?: string;
}

export type CriterionResult = "matched" | "missing" | "negative" | "unknown";

export interface ICPCriterionMatch {
  label: string;
  result: CriterionResult;
  detail?: string;
}

export interface ICPQualitativeMatch {
  overall: "Strong" | "Moderate" | "Weak" | "Unknown";
  criteria: ICPCriterionMatch[];
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function listContains(list: string[], value: string | null | undefined): boolean {
  const v = normalize(value);
  if (!v) return false;
  return list.some((item) => v.includes(normalize(item)) || normalize(item).includes(v));
}

function textContainsAny(text: string | null | undefined, keywords: string[]): string | null {
  const t = normalize(text);
  if (!t) return null;
  const hit = keywords.find((k) => t.includes(normalize(k)));
  return hit ?? null;
}

/** One criterion: "unknown" when the tenant hasn't configured this list at all. */
function evaluateListCriterion(
  label: string,
  configured: string[],
  excluded: string[] | undefined,
  sampleValue: string | null | undefined
): ICPCriterionMatch {
  if (excluded?.length && listContains(excluded, sampleValue)) {
    return { label, result: "negative", detail: sampleValue ?? undefined };
  }
  if (!configured.length) return { label, result: "unknown" };
  if (!sampleValue) return { label, result: "unknown" };
  return listContains(configured, sampleValue)
    ? { label, result: "matched", detail: sampleValue }
    : { label, result: "missing", detail: sampleValue };
}

function evaluateRangeCriterion(
  label: string,
  min: number | null,
  max: number | null,
  sampleValue: number | null | undefined
): ICPCriterionMatch {
  if (min == null && max == null) return { label, result: "unknown" };
  if (sampleValue == null) return { label, result: "unknown" };
  const withinMin = min == null || sampleValue >= min;
  const withinMax = max == null || sampleValue <= max;
  return withinMin && withinMax
    ? { label, result: "matched", detail: String(sampleValue) }
    : { label, result: "missing", detail: String(sampleValue) };
}

/**
 * Simulation only — pure function, no DB access, no external calls. Compares
 * a sample lead-like input against one ICP profile's stored configuration
 * and returns qualitative (not numeric) criteria matches. Does not call
 * Apollo, Gemini, Lead Scoring, the Orchestrator, CRM Sync, Opportunity, or
 * ROI, and creates no records — callers must not wrap this in anything that
 * does either.
 */
export function evaluateICPFitQualitative(config: ICPConfig, sample: ICPTestSampleInput): ICPQualitativeMatch {
  const criteria: ICPCriterionMatch[] = [];

  criteria.push(evaluateListCriterion(
    "Target industry",
    config.companyFit.targetIndustries,
    config.companyFit.excludedIndustries,
    sample.industry
  ));

  criteria.push(evaluateListCriterion(
    "Target geography",
    config.companyFit.targetCountries,
    undefined,
    sample.country
  ));

  criteria.push(evaluateRangeCriterion(
    "Target company size",
    config.companyFit.employeeSizeMin,
    config.companyFit.employeeSizeMax,
    sample.employeeCount
  ));

  const personaTitles = [
    ...config.personaFit.targetTitles,
    ...config.personaFit.decisionMakerTitles,
    ...config.personaFit.economicBuyerTitles,
  ];
  criteria.push(evaluateListCriterion(
    "Target persona",
    personaTitles,
    config.personaFit.nonTargetPersonas,
    sample.jobTitle
  ));

  if (!config.problemFit.priorityPainPoints.length) {
    criteria.push({ label: "Priority pain point", result: "unknown" });
  } else {
    const hit = textContainsAny(sample.notes, config.problemFit.priorityPainPoints);
    criteria.push(hit
      ? { label: "Priority pain point", result: "matched", detail: hit }
      : { label: "Priority pain point", result: sample.notes ? "missing" : "unknown" });
  }

  if (!config.buyingSignals.high.length && !config.buyingSignals.medium.length) {
    criteria.push({ label: "Buying signal", result: "unknown" });
  } else {
    const negativeHit = textContainsAny(sample.notes, config.buyingSignals.negative);
    const highHit = textContainsAny(sample.notes, config.buyingSignals.high);
    const mediumHit = textContainsAny(sample.notes, config.buyingSignals.medium);
    if (negativeHit) {
      criteria.push({ label: "Buying signal", result: "negative", detail: negativeHit });
    } else if (highHit) {
      criteria.push({ label: "High-intent buying signal", result: "matched", detail: highHit });
    } else if (mediumHit) {
      criteria.push({ label: "Buying signal", result: "matched", detail: mediumHit });
    } else {
      criteria.push({ label: "High-intent buying signal", result: sample.notes ? "missing" : "unknown" });
    }
  }

  const assessed = criteria.filter((c) => c.result !== "unknown");
  const hasNegative = criteria.some((c) => c.result === "negative");
  const matchedCount = criteria.filter((c) => c.result === "matched").length;

  let overall: ICPQualitativeMatch["overall"];
  if (hasNegative) overall = "Weak";
  else if (assessed.length === 0) overall = "Unknown";
  else if (matchedCount === assessed.length) overall = "Strong";
  else if (matchedCount > 0) overall = "Moderate";
  else overall = "Weak";

  return { overall, criteria };
}
