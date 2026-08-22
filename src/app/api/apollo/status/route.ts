import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// GET /api/apollo/status — lets the UI show a proactive notice when Apollo
// credentials aren't configured, rather than only finding out after
// attempting an enrichment.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ apolloConnected: !!process.env.APOLLO_API_KEY });
}
