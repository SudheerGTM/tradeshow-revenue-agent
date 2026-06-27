import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { Tenant } from "@/db/schema";

export type TenantContext = Tenant;

// The production apex domain — also has 3 labels itself, so a naive
// "3+ labels = subdomain" check (the previous implementation) incorrectly
// treated the bare apex as a tenant subdomain with slug "tradeshow-agent",
// which is not a real tenant. Comparing against the actual root domain
// avoids that.
const ROOT_DOMAIN = "tradeshow-agent.gtmtechsol.ai";

/**
 * Returns the tenant slug for an actual tenant subdomain (e.g.
 * "demo-logistics" from "demo-logistics.tradeshow-agent.gtmtechsol.ai"), or
 * `null` when the request is on the bare apex domain or localhost — i.e. no
 * tenant-specific subdomain was used, so no tenant scoping should be
 * enforced by callers.
 */
export function resolveTenantSlug(hostname: string): string | null {
  const host = hostname.split(":")[0]; // strip port, e.g. "localhost:3001"
  if (host === ROOT_DOMAIN || host === "localhost" || host.startsWith("127.")) {
    return null;
  }
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    return host.slice(0, -(ROOT_DOMAIN.length + 1));
  }
  return null;
}

export async function getTenantBySlug(slug: string): Promise<TenantContext | null> {
  const rows = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTenantById(id: string): Promise<TenantContext | null> {
  const rows = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, id))
    .limit(1);
  return rows[0] ?? null;
}
