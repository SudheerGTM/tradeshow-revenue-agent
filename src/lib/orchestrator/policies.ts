/**
 * Agent policy engine — reads agent_policies rows and evaluates them
 * against runtime values. Deliberately small and declarative: a policy is
 * data (configuration jsonb), not code, so new threshold rules can be added
 * via the agent_policies table without a deploy.
 */

import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

interface ThresholdConfig {
  field: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
  action: "skip_step" | "flag_needs_review" | "block_auto_execution";
}

export interface PolicyEvalResult {
  blocked: boolean;
  reason?: string;
  policyName?: string;
}

function compare(actual: number, operator: ThresholdConfig["operator"], threshold: number): boolean {
  switch (operator) {
    case "lt": return actual < threshold;
    case "lte": return actual <= threshold;
    case "gt": return actual > threshold;
    case "gte": return actual >= threshold;
    case "eq": return actual === threshold;
  }
}

/**
 * Evaluates all enabled policies of a given type for an agent against the
 * supplied runtime values (e.g. { score: 45 }). Returns blocked=true on the
 * first matching threshold_block policy.
 */
export async function evaluatePolicy(
  agentName: string,
  policyType: string,
  values: Record<string, number | undefined>
): Promise<PolicyEvalResult> {
  const policies = await db.select().from(schema.agentPolicies)
    .where(and(eq(schema.agentPolicies.agentName, agentName), eq(schema.agentPolicies.policyType, policyType), eq(schema.agentPolicies.enabled, true)));

  for (const policy of policies) {
    const config = policy.configuration as unknown as ThresholdConfig | null;
    if (!config || !config.field) continue;
    const actual = values[config.field];
    if (actual == null) continue;

    const matches = compare(actual, config.operator, config.value);
    if (matches && config.action === "skip_step") {
      return { blocked: true, reason: `Blocked by policy "${policy.policyName}" (${config.field} ${config.operator} ${config.value})`, policyName: policy.policyName };
    }
  }

  return { blocked: false };
}

export async function listPolicies() {
  return db.select().from(schema.agentPolicies).orderBy(schema.agentPolicies.agentName);
}
