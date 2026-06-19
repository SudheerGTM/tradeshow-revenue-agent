import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { Tenant } from "@/db/schema";

export type TenantContext = Tenant;

export function resolveTenantSlug(hostname: string): string {
  if (hostname.startsWith("localhost") || hostname.startsWith("127.")) return "demo";
  const parts = hostname.split(".");
  return parts.length >= 3 ? parts[0] : "demo";
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
