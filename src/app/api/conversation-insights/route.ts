import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const leadId = req.nextUrl.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  // Booth users can only access their own leads
  if (session.user.role === "booth_user") {
    const lead = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(
        eq(schema.leads.id, leadId),
        eq(schema.leads.tenantId, tenantId),
        eq(schema.leads.createdByUserId, session.user.id!)
      ))
      .limit(1);
    if (!lead.length) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(schema.conversationInsights)
    .where(and(
      eq(schema.conversationInsights.leadId, leadId),
      eq(schema.conversationInsights.tenantId, tenantId),
    ))
    .orderBy(desc(schema.conversationInsights.createdAt));

  return NextResponse.json(rows);
}
