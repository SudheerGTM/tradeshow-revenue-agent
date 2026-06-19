/**
 * Seed script — Run with:
 *   DATABASE_URL=postgres://... npx tsx scripts/seed.ts
 *
 * Creates two tenants and four users (one per role).
 * Safe to re-run — skips existing records by slug/email.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function upsertTenant(data: schema.NewTenant) {
  const existing = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, data.slug!))
    .limit(1);
  if (existing.length) {
    console.log(`  ↩ tenant already exists: ${data.slug}`);
    return existing[0].id;
  }
  const [t] = await db.insert(schema.tenants).values(data).returning({ id: schema.tenants.id });
  console.log(`  ✓ tenant created: ${data.slug}`);
  return t.id;
}

async function upsertUser(data: Omit<schema.NewUser, "passwordHash"> & { password: string }) {
  const { password, ...rest } = data;
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, rest.email!))
    .limit(1);
  if (existing.length) {
    console.log(`  ↩ user already exists: ${rest.email}`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(schema.users).values({ ...rest, passwordHash });
  console.log(`  ✓ user created: ${rest.email} (${rest.role})`);
}

async function main() {
  console.log("\n── Seeding tenants ──────────────────────────────────");

  const demoId = await upsertTenant({
    name: "Demo Logistics",
    slug: "demo-logistics",
    subdomain: "demo",
    eventName: "MODEX 2025",
    status: "active",
  });

  const multimodalId = await upsertTenant({
    name: "Multimodal Demo",
    slug: "multimodal-demo",
    subdomain: "multimodal",
    eventName: "FreightWaves LIVE 2025",
    status: "active",
  });

  console.log("\n── Seeding users ────────────────────────────────────");

  // platform_admin — no tenant
  await upsertUser({
    name: "Platform Admin",
    email: "admin@platform.com",
    password: "Password123!",
    role: "platform_admin",
    tenantId: null,
  });

  // tenant_admin — Demo Logistics
  await upsertUser({
    name: "Demo Admin",
    email: "admin@demo.com",
    password: "Password123!",
    role: "tenant_admin",
    tenantId: demoId,
  });

  // manager — Demo Logistics
  await upsertUser({
    name: "Demo Manager",
    email: "manager@demo.com",
    password: "Password123!",
    role: "manager",
    tenantId: demoId,
  });

  // booth_user — Demo Logistics
  await upsertUser({
    name: "Demo Booth Staff",
    email: "booth@demo.com",
    password: "Password123!",
    role: "booth_user",
    tenantId: demoId,
  });

  // tenant_admin — Multimodal Demo
  await upsertUser({
    name: "Multimodal Admin",
    email: "admin@multimodal.com",
    password: "Password123!",
    role: "tenant_admin",
    tenantId: multimodalId,
  });

  console.log("\n✅  Seed complete.\n");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
