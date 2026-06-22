import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";
import ExcelJS from "exceljs";

// GET /api/events/[id]/export/excel — tenant_admin only.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (session.user.role !== "tenant_admin") {
    return NextResponse.json({ error: "Only tenant admins can export event reports" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const eventRows = await db.select().from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, tenantId))).limit(1);
  if (!eventRows.length) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const event = eventRows[0];

  const { record, result } = await recalculateAndStoreROI(eventId, tenantId, session.user.id);

  const costs = await db.select().from(schema.eventCosts).where(and(eq(schema.eventCosts.eventId, eventId), eq(schema.eventCosts.tenantId, tenantId)));
  const topOpportunities = await db.select().from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")))
    .orderBy(desc(schema.opportunities.expectedRevenue)).limit(10);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Trade Show Revenue Agent";
  wb.created = new Date();

  // Summary sheet
  const summary = wb.addWorksheet("Executive Summary");
  summary.columns = [{ header: "Metric", key: "metric", width: 32 }, { header: "Value", key: "value", width: 24 }];
  summary.addRows([
    { metric: "Event", value: event.name },
    { metric: "Executive Summary", value: record.executiveSummary ?? "Not generated yet" },
    { metric: "Event Cost (£)", value: result.totalEventCost },
    { metric: "Total Leads", value: result.totalLeads },
    { metric: "Qualified Leads (Hot+Warm)", value: result.qualifiedLeads },
    { metric: "Hot Leads", value: result.hotLeads },
    { metric: "Opportunities Created", value: result.opportunitiesCreated },
    { metric: "Pipeline Generated (£)", value: result.pipelineGenerated },
    { metric: "Expected Revenue (£)", value: result.expectedRevenue },
    { metric: "Won Revenue (£)", value: result.wonRevenue },
    { metric: "ROI %", value: result.roiPercentage ?? "n/a" },
    { metric: "Cost Per Lead (£)", value: result.costPerLead ?? "n/a" },
    { metric: "Cost Per Qualified Lead (£)", value: result.costPerQualifiedLead ?? "n/a" },
    { metric: "Cost Per Opportunity (£)", value: result.costPerOpportunity ?? "n/a" },
  ]);
  summary.getRow(1).font = { bold: true };

  // Costs sheet
  const costSheet = wb.addWorksheet("Event Costs");
  costSheet.columns = [
    { header: "Category", key: "category", width: 18 },
    { header: "Description", key: "description", width: 36 },
    { header: "Amount (£)", key: "amount", width: 16 },
  ];
  costSheet.addRows(costs.map(c => ({ category: c.costCategory, description: c.description ?? "", amount: parseFloat(c.amount) })));
  costSheet.getRow(1).font = { bold: true };

  // Top opportunities sheet
  const oppSheet = wb.addWorksheet("Top Opportunities");
  oppSheet.columns = [
    { header: "Opportunity", key: "name", width: 36 },
    { header: "Company", key: "company", width: 28 },
    { header: "Stage", key: "stage", width: 20 },
    { header: "Amount (£)", key: "amount", width: 16 },
    { header: "Expected Revenue (£)", key: "expRev", width: 20 },
  ];
  oppSheet.addRows(topOpportunities.map(o => ({
    name: o.opportunityName, company: o.companyName, stage: o.stage,
    amount: o.amount != null ? parseFloat(o.amount) : "", expRev: o.expectedRevenue != null ? parseFloat(o.expectedRevenue) : "",
  })));
  oppSheet.getRow(1).font = { bold: true };

  // Pipeline by stage sheet
  const stageSheet = wb.addWorksheet("Pipeline by Stage");
  stageSheet.columns = [
    { header: "Stage", key: "stage", width: 24 },
    { header: "Count", key: "count", width: 12 },
    { header: "Amount (£)", key: "amount", width: 16 },
  ];
  stageSheet.addRows(result.pipelineByStage.map(s => ({ stage: s.stage, count: s.count, amount: s.amount })));
  stageSheet.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();

  await logAudit({
    tenantId, userId: session.user.id,
    action: "report_exported",
    resourceType: "event_roi",
    resourceId: eventId,
    metadata: { format: "excel" },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(event.name)}-roi-report.xlsx"`,
    },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase() || "event";
}
