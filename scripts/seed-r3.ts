/**
 * Release 3 seed — events + 20 sample leads
 * Run with: DATABASE_URL=... npx tsx scripts/seed-r3.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const FIRST_NAMES = ["James","Sarah","Michael","Emma","David","Olivia","Robert","Sophia","William","Ava",
  "Thomas","Isabella","Charles","Mia","George","Charlotte","Henry","Amelia","Edward","Harper"];
const LAST_NAMES  = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Wilson","Taylor",
  "Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Moore","Allen","Young"];
const TITLES = ["Head of Logistics","Supply Chain Director","Operations Manager","Freight Manager",
  "Transport Planner","Warehouse Manager","Procurement Lead","Logistics Analyst","Fleet Manager","VP Operations"];
const COMPANIES = ["Acme Freight","GlobalShip Ltd","FastTrack Logistics","BlueSky Transport",
  "NorthStar Cargo","IronBridge Logistics","Summit Freight","Horizon Shipping",
  "EcoMove Transport","Alpine Distribution"];
const COUNTRIES = ["United Kingdom","Germany","Netherlands","France","Belgium","Poland","Sweden","Denmark","Spain","Italy"];
const STATUSES: schema.LeadStatus[] = ["new","new","new","contacted","contacted","qualified","disqualified"];
const SOURCES: schema.LeadSource[] = ["manual","manual","qr_form","business_card"];

function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

async function upsertEvent(tenantId: string, data: Omit<schema.NewEvent, "tenantId" | "id" | "createdAt" | "updatedAt">) {
  const existing = await db.select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.tenantId, tenantId), eq(schema.events.slug, data.slug!)))
    .limit(1);
  if (existing.length) { console.log(`  ↩ event exists: ${data.slug}`); return existing[0].id; }
  const [ev] = await db.insert(schema.events).values({ ...data, tenantId }).returning({ id: schema.events.id });
  console.log(`  ✓ event created: ${data.name}`);
  return ev.id;
}

async function main() {
  // Get tenant ids
  const tenants = await db.select({ id: schema.tenants.id, slug: schema.tenants.slug })
    .from(schema.tenants);
  const demoTenant = tenants.find(t => t.slug === "demo-logistics");
  const multiTenant = tenants.find(t => t.slug === "multimodal-demo");

  if (!demoTenant || !multiTenant) {
    console.error("Run the R2 seed first: npm run db:seed");
    process.exit(1);
  }

  // Get a user to assign as creator
  const demoUsers = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.tenantId, demoTenant.id));
  const creatorId = demoUsers[0]?.id ?? null;

  console.log("\n── Seeding events ───────────────────────────────────");

  const multimodalId = await upsertEvent(demoTenant.id, {
    name: "Multimodal 2026",
    slug: "multimodal-2026",
    location: "Birmingham, UK",
    startDate: "2026-06-02",
    endDate: "2026-06-04",
    status: "upcoming",
  });

  const ukLogisticsId = await upsertEvent(demoTenant.id, {
    name: "UK Logistics Week",
    slug: "uk-logistics-week",
    location: "London, UK",
    startDate: "2026-09-14",
    endDate: "2026-09-18",
    status: "upcoming",
  });

  await upsertEvent(multiTenant.id, {
    name: "Multimodal 2026",
    slug: "multimodal-2026",
    location: "Birmingham, UK",
    startDate: "2026-06-02",
    endDate: "2026-06-04",
    status: "upcoming",
  });

  console.log("\n── Seeding 20 leads ─────────────────────────────────");

  const eventIds = [multimodalId, ukLogisticsId];

  for (let i = 0; i < 20; i++) {
    const firstName = FIRST_NAMES[i];
    const lastName  = LAST_NAMES[i];
    const email     = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${COMPANIES[i % COMPANIES.length].toLowerCase().replace(/\s+/g, "")}.com`;

    const [lead] = await db.insert(schema.leads).values({
      tenantId: demoTenant.id,
      eventId: eventIds[i % 2],
      createdByUserId: creatorId,
      firstName,
      lastName,
      jobTitle: TITLES[i % TITLES.length],
      companyName: COMPANIES[i % COMPANIES.length],
      email,
      phone: `+44 7${700 + i} ${String(100000 + i * 7).padStart(6, "0")}`,
      country: COUNTRIES[i % COUNTRIES.length],
      source: SOURCES[i % SOURCES.length],
      status: STATUSES[i % STATUSES.length],
      consentGiven: true,
      consentTimestamp: new Date(),
      notes: i % 3 === 0 ? "Strong interest in our automation platform." : null,
    }).returning({ id: schema.leads.id });

    await db.insert(schema.auditLogs).values({
      tenantId: demoTenant.id,
      userId: creatorId,
      action: "lead.created",
      resourceType: "lead",
      resourceId: lead.id,
      metadata: { source: SOURCES[i % SOURCES.length] },
    });

    console.log(`  ✓ lead ${i + 1}/20: ${firstName} ${lastName}`);
  }

  console.log("\n✅  Release 3 seed complete.\n");
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
