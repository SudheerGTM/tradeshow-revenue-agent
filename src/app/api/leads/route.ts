import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";
import type { LeadSource } from "@/db/schema";

// GET /api/leads — tenant-scoped; booth_user sees only their own
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const search         = searchParams.get("search") ?? "";
  const status         = searchParams.get("status") ?? "";
  const eventId        = searchParams.get("eventId") ?? "";
  const classification = searchParams.get("classification") ?? "";
  const page           = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit          = 20;
  const offset         = (page - 1) * limit;

  const conditions = [eq(schema.leads.tenantId, tenantId)];

  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }
  if (status) conditions.push(eq(schema.leads.status, status as typeof schema.leads.$inferSelect["status"]));
  if (eventId) conditions.push(eq(schema.leads.eventId, eventId));
  if (search) {
    conditions.push(
      or(
        ilike(schema.leads.firstName, `%${search}%`),
        ilike(schema.leads.lastName, `%${search}%`),
        ilike(schema.leads.companyName, `%${search}%`),
        ilike(schema.leads.email, `%${search}%`)
      )!
    );
  }

  // Subquery: latest score per lead
  const latestScoreSq = db
    .selectDistinctOn([schema.leadScores.leadId], {
      leadId:                schema.leadScores.leadId,
      score:                 schema.leadScores.score,
      classification:        schema.leadScores.classification,
      expectedRevenue:       schema.leadScores.expectedRevenue,
      recommendedNextAction: schema.leadScores.recommendedNextAction,
    })
    .from(schema.leadScores)
    .where(eq(schema.leadScores.tenantId, tenantId))
    .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt))
    .as("latest_score");

  const rows = await db
    .select({
      id:          schema.leads.id,
      firstName:   schema.leads.firstName,
      lastName:    schema.leads.lastName,
      jobTitle:    schema.leads.jobTitle,
      companyName: schema.leads.companyName,
      email:       schema.leads.email,
      phone:       schema.leads.phone,
      status:      schema.leads.status,
      source:      schema.leads.source,
      eventId:     schema.leads.eventId,
      createdAt:   schema.leads.createdAt,
      latestScore:                  latestScoreSq.score,
      latestClassification:         latestScoreSq.classification,
      expectedRevenue:              latestScoreSq.expectedRevenue,
      recommendedNextAction:        latestScoreSq.recommendedNextAction,
    })
    .from(schema.leads)
    .leftJoin(latestScoreSq, eq(schema.leads.id, latestScoreSq.leadId))
    .where(and(...conditions))
    .orderBy(
      sql`COALESCE(${latestScoreSq.score}::numeric, -1) DESC`,
      desc(schema.leads.createdAt)
    )
    .limit(limit)
    .offset(offset);

  // Classification filter applied in memory (simpler than a HAVING clause on the lateral join)
  const filtered = classification
    ? rows.filter(r => r.latestClassification === classification)
    : rows;

  const mapped = filtered.map(r => ({
    ...r,
    latestScore: r.latestScore != null ? parseFloat(r.latestScore as unknown as string) : null,
    expectedRevenue: r.expectedRevenue != null ? parseFloat(r.expectedRevenue as unknown as string) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));

  return NextResponse.json({ leads: mapped, page, limit });
}

// POST /api/leads — any authenticated user
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json();
  const {
    firstName, lastName, jobTitle, companyName,
    email, phone, country, source, notes, eventId,
    consentGiven,
  } = body as {
    firstName: string; lastName?: string; jobTitle?: string; companyName: string;
    email?: string; phone?: string; country?: string;
    source?: LeadSource; notes?: string; eventId?: string;
    consentGiven?: boolean;
  };

  if (!firstName) return NextResponse.json({ error: "first_name required" }, { status: 400 });
  if (!companyName) return NextResponse.json({ error: "company_name required" }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "email or phone required" }, { status: 400 });
  if (!consentGiven) return NextResponse.json({ error: "consent required" }, { status: 400 });

  const [lead] = await db
    .insert(schema.leads)
    .values({
      tenantId,
      eventId: eventId || null,
      createdByUserId: session.user.id ?? null,
      firstName, lastName, jobTitle, companyName,
      email, phone, country,
      source: source ?? "manual",
      consentGiven: !!consentGiven,
      consentTimestamp: consentGiven ? new Date() : null,
      notes,
    })
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "lead.created",
    resourceType: "lead",
    resourceId: lead.id,
    metadata: { firstName, lastName, companyName, source: source ?? "manual" },
  });

  return NextResponse.json(lead, { status: 201 });
}

