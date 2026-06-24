import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { and, eq, or, ilike } from "drizzle-orm";

// GET /api/leads/check-duplicate?email=&firstName=&companyName=
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const email       = searchParams.get("email")?.trim() ?? "";
  const firstName   = searchParams.get("firstName")?.trim() ?? "";
  const companyName = searchParams.get("companyName")?.trim() ?? "";

  const matchConditions = [];
  if (email) matchConditions.push(ilike(schema.leads.email, email));
  if (firstName && companyName) {
    matchConditions.push(
      and(ilike(schema.leads.firstName, firstName), ilike(schema.leads.companyName, companyName))!
    );
  }

  if (!matchConditions.length) return NextResponse.json({ match: null });

  const rows = await db
    .select({
      id: schema.leads.id,
      firstName: schema.leads.firstName,
      lastName: schema.leads.lastName,
      companyName: schema.leads.companyName,
      email: schema.leads.email,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.tenantId, tenantId), or(...matchConditions)))
    .limit(1);

  const match = rows[0] ?? null;

  if (match) {
    await logAudit({
      tenantId,
      userId: session.user.id,
      action: "duplicate_detected",
      resourceType: "lead",
      resourceId: match.id,
      metadata: { attemptedEmail: email, attemptedFirstName: firstName, attemptedCompanyName: companyName },
    });
  }

  return NextResponse.json({ match });
}
