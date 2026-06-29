import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// GET /api/crm-sync/status — lets the UI show a proactive notice when this
// tenant's HubSpot credentials aren't configured, rather than only finding
// out after attempting an approve action.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ hubspotConnected: !!process.env.HUBSPOT_ACCESS_TOKEN });
}
