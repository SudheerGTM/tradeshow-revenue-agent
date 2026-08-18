import { z } from "zod";

/**
 * Validated shape of icp_profiles.configuration_json (Release 14.2).
 *
 * scoringWeights is part of the schema so the data model doesn't need a
 * breaking change when weight-editing ships later, but per the R14.2 approval
 * decision it is NOT read or applied by any scoring logic yet, and no UI
 * exposes editing it — see docs/RELEASE-14-CONFIGURABLE-ICP.md.
 */

const stringList = z.array(z.string().min(1)).default([]);

export const ScoringWeightsSchema = z
  .object({
    companyFit: z.number().min(0).max(100),
    personaFit: z.number().min(0).max(100),
    problemFit: z.number().min(0).max(100),
    buyingIntent: z.number().min(0).max(100),
    engagement: z.number().min(0).max(100),
    dataQuality: z.number().min(0).max(100),
  })
  .refine(
    (w) => Object.values(w).reduce((sum, v) => sum + v, 0) === 100,
    { message: "scoringWeights must sum to exactly 100" }
  );

export const DEFAULT_SCORING_WEIGHTS = {
  companyFit: 25,
  personaFit: 20,
  problemFit: 20,
  buyingIntent: 15,
  engagement: 10,
  dataQuality: 10,
} as const;

export const ICPProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  targetPersonas: stringList,
  painPointsAddressed: stringList,
  useCases: stringList,
  keywords: stringList,
  valueProposition: z.string().default(""),
  typicalDealValue: z.number().nullable().default(null),
});

export const ICPConfigSchema = z.object({
  companyFit: z.object({
    targetIndustries: stringList,
    targetSubindustries: stringList,
    targetCountries: stringList,
    employeeSizeMin: z.number().int().nullable().default(null),
    employeeSizeMax: z.number().int().nullable().default(null),
    revenueRangeMin: z.number().nullable().default(null),
    revenueRangeMax: z.number().nullable().default(null),
    companyTypes: stringList,
    relevantTechnologies: stringList,
    excludedIndustries: stringList,
    excludedCompanyTypes: stringList,
    exclusions: stringList,
  }),
  personaFit: z.object({
    targetDepartments: stringList,
    targetJobFunctions: stringList,
    targetTitles: stringList,
    targetSeniority: stringList,
    decisionMakerTitles: stringList,
    economicBuyerTitles: stringList,
    influencerTitles: stringList,
    championTitles: stringList,
    nonTargetPersonas: stringList,
  }),
  problemFit: z.object({
    priorityPainPoints: stringList,
    businessChallenges: stringList,
    businessObjectives: stringList,
    priorityUseCases: stringList,
    triggerEvents: stringList,
  }),
  buyingSignals: z.object({
    high: stringList,
    medium: stringList,
    negative: stringList,
  }),
  products: z.array(ICPProductSchema).default([]),
  // Present for forward compatibility only — not read by any scoring logic
  // in R14.2 and not exposed in any UI. See file header.
  scoringWeights: ScoringWeightsSchema.default(DEFAULT_SCORING_WEIGHTS),
});

export type ICPConfig = z.infer<typeof ICPConfigSchema>;
export type ICPProduct = z.infer<typeof ICPProductSchema>;
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

/** Empty-but-valid config, useful as a starting point for a new draft profile. */
export function emptyICPConfig(): ICPConfig {
  return ICPConfigSchema.parse({
    companyFit: {},
    personaFit: {},
    problemFit: {},
    buyingSignals: {},
    products: [],
  });
}
