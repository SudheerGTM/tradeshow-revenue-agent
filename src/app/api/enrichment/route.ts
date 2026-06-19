import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const leadId = req.nextUrl.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  // Verify the lead belongs to this tenant
  const lead = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId)))
    .limit(1);
  if (!lead.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [company] = await db
    .select()
    .from(schema.companyEnrichment)
    .where(and(eq(schema.companyEnrichment.leadId, leadId), eq(schema.companyEnrichment.tenantId, tenantId)))
    .limit(1);

  const [contact] = await db
    .select()
    .from(schema.contactEnrichment)
    .where(and(eq(schema.contactEnrichment.leadId, leadId), eq(schema.contactEnrichment.tenantId, tenantId)))
    .limit(1);

  return NextResponse.json({ company: company ?? null, contact: contact ?? null });
}
