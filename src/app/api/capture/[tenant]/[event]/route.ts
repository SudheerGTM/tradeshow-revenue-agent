import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

// POST /api/capture/:tenant/:event — public, no auth
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string; event: string }> }
) {
  const { tenant: tenantSlug, event: eventSlug } = await params;

  const tenantRow = await db
    .select({ id: schema.tenants.id, status: schema.tenants.status })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, tenantSlug))
    .limit(1);

  if (!tenantRow.length || tenantRow[0].status !== "active") {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const tenantId = tenantRow[0].id;

  const eventRow = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.slug, eventSlug), eq(schema.events.tenantId, tenantId)))
    .limit(1);

  if (!eventRow.length) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const eventId = eventRow[0].id;

  const body = await req.json();
  const { firstName, lastName, jobTitle, companyName, email, phone, country, consentGiven } =
    body as {
      firstName: string; lastName?: string; jobTitle?: string; companyName: string;
      email?: string; phone?: string; country?: string; consentGiven: boolean;
    };

  if (!firstName) return NextResponse.json({ error: "first_name required" }, { status: 400 });
  if (!companyName) return NextResponse.json({ error: "company_name required" }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "email or phone required" }, { status: 400 });
  if (!consentGiven) return NextResponse.json({ error: "consent required" }, { status: 400 });

  const [lead] = await db
    .insert(schema.leads)
    .values({
      tenantId,
      eventId,
      createdByUserId: null,
      firstName, lastName, jobTitle, companyName,
      email, phone, country,
      source: "qr_form",
      consentGiven: true,
      consentTimestamp: new Date(),
    })
    .returning({ id: schema.leads.id });

  await logAudit({
    tenantId,
    userId: null,
    action: "lead.created",
    resourceType: "lead",
    resourceId: lead.id,
    metadata: { source: "qr_form", eventSlug },
  });

  return NextResponse.json({ success: true, leadId: lead.id }, { status: 201 });
}
