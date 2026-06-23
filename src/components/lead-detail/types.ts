// Shared lightweight types for the Lead Detail workspace.
// These mirror API response shapes already returned by existing endpoints —
// no backend, schema, or API changes are introduced by this redesign.

export type Classification = "hot" | "warm" | "cold" | "needs_review";

export interface LeadScoreSummary {
  id: string;
  score: string;
  classification: Classification;
  companyFitScore: string;
  authorityScore: string;
  needScore: string;
  urgencyScore: string;
  engagementScore: string;
  dataQualityScore: string;
  estimatedOpportunityValue: string | null;
  estimatedCloseProbability: string | null;
  expectedRevenue: string | null;
  scoreExplanation: string | null;
  scoreDrivers: unknown;
  risks: unknown;
  recommendedNextAction: string | null;
  confidenceScore: string | null;
  needsHumanReview: boolean;
  modelUsed: string | null;
  status: string;
  createdAt: string;
}

export interface ConversationInsightSummary {
  id: string;
  painPoints: unknown;
  productInterest: unknown;
  businessNeed: string | null;
  urgency: "low" | "medium" | "high" | "unknown";
  timeline: string | null;
  budgetSignal: string | null;
  decisionMakerSignal: string | null;
  competitorMentioned: string | null;
  nextBestAction: string | null;
  summary: string | null;
  recommendedFollowUp: string | null;
  confidenceScore: string | null;
  status: string;
  createdAt: string;
}

export interface CompanyEnrichmentSummary {
  companyName: string | null;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  subIndustry: string | null;
  employeeCount: string | null;
  employeeRange: string | null;
  annualRevenue: string | null;
  revenueRange: string | null;
  headquarters: string | null;
  foundedYear: string | null;
  companyDescription: string | null;
  enrichmentStatus: string;
  updatedAt: string;
}

export interface OpportunitySummary {
  id: string;
  opportunityName: string;
  stage: string;
  priority: string;
  amount: number | null;
  probability: number | null;
  expectedRevenue: number | null;
  expectedCloseDate: string | null;
  status: string;
  ownerName: string | null;
}

export function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}

export function fmtGBP(n: number | null | undefined): string {
  if (n == null) return "—";
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}
