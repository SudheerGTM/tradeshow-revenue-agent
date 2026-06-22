import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";
import PDFDocument from "pdfkit";

// GET /api/events/[id]/export/pdf — tenant_admin only.
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
  const topOpportunities = await db.select().from(schema.opportunities)
    .where(and(eq(schema.opportunities.eventId, eventId), eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")))
    .orderBy(desc(schema.opportunities.expectedRevenue)).limit(10);

  const buffer = await renderPdf(event.name, result, record.executiveSummary, topOpportunities);

  await logAudit({
    tenantId, userId: session.user.id,
    action: "report_exported",
    resourceType: "event_roi",
    resourceId: eventId,
    metadata: { format: "pdf" },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(event.name)}-roi-report.pdf"`,
    },
  });
}

function fmtGBP(n: number): string {
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

async function renderPdf(
  eventName: string,
  metrics: Awaited<ReturnType<typeof recalculateAndStoreROI>>["result"],
  executiveSummary: string | null,
  topOpportunities: { opportunityName: string; companyName: string; stage: string; expectedRevenue: string | null }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).fillColor("#0F4C81").text("Trade Show ROI Report", { align: "left" });
    doc.fontSize(14).fillColor("#000").text(eventName, { align: "left" });
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#0F4C81").text("Executive Summary");
    doc.fontSize(10).fillColor("#333").text(executiveSummary ?? "Executive summary not yet generated.", { align: "left" });
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#0F4C81").text("Key Metrics");
    doc.fontSize(10).fillColor("#000");
    const rows: [string, string][] = [
      ["Event Cost", fmtGBP(metrics.totalEventCost)],
      ["Total Leads", String(metrics.totalLeads)],
      ["Qualified Leads", String(metrics.qualifiedLeads)],
      ["Hot Leads", String(metrics.hotLeads)],
      ["Opportunities Created", String(metrics.opportunitiesCreated)],
      ["Pipeline Generated", fmtGBP(metrics.pipelineGenerated)],
      ["Expected Revenue", fmtGBP(metrics.expectedRevenue)],
      ["Won Revenue", fmtGBP(metrics.wonRevenue)],
      ["ROI %", metrics.roiPercentage != null ? `${metrics.roiPercentage}%` : "n/a"],
      ["Cost Per Lead", metrics.costPerLead != null ? fmtGBP(metrics.costPerLead) : "n/a"],
      ["Cost Per Qualified Lead", metrics.costPerQualifiedLead != null ? fmtGBP(metrics.costPerQualifiedLead) : "n/a"],
      ["Cost Per Opportunity", metrics.costPerOpportunity != null ? fmtGBP(metrics.costPerOpportunity) : "n/a"],
    ];
    for (const [label, value] of rows) {
      doc.text(`${label}: `, { continued: true }).fillColor("#0F4C81").text(value).fillColor("#000");
    }
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#0F4C81").text("Pipeline by Stage");
    doc.fontSize(10).fillColor("#000");
    for (const s of metrics.pipelineByStage) {
      doc.text(`${s.stage.replace(/_/g, " ")}: ${s.count} opportunities, ${fmtGBP(s.amount)}`);
    }
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#0F4C81").text("Top Opportunities");
    doc.fontSize(10).fillColor("#000");
    if (topOpportunities.length === 0) {
      doc.text("No active opportunities for this event.");
    } else {
      for (const o of topOpportunities) {
        const expRev = o.expectedRevenue != null ? fmtGBP(parseFloat(o.expectedRevenue)) : "n/a";
        doc.text(`${o.opportunityName} (${o.companyName}) — ${o.stage.replace(/_/g, " ")} — Expected Revenue: ${expRev}`);
      }
    }

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor("#888").text(`Generated ${new Date().toLocaleString()} · Trade Show Revenue Agent`, { align: "left" });

    doc.end();
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase() || "event";
}
