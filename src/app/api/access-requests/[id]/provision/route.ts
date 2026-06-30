import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions";
import { provisionTenantFromAccessRequest } from "@/lib/agents/tenant-provisioning-agent";

// POST /api/access-requests/[id]/provision — platform admin only
// Runs the provisioning agent for an approved request.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const result = await provisionTenantFromAccessRequest(id, session.user.id);
    return NextResponse.json({
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug,
      invitationId: result.invitation.id,
      emailResults: result.emailResults,
      wasAlreadyProvisioned: result.wasAlreadyProvisioned,
      // Surface email guidance for admin when SES sandbox blocks delivery
      emailWarning:
        result.emailResults.approvalEmail !== "sent" || result.emailResults.invitationEmail !== "sent"
          ? `One or more emails could not be delivered to ${result.invitation.email}. ` +
            "SES is in sandbox mode — only verified addresses can receive mail. " +
            `The invitation link remains valid for 7 days. Share it manually: ${process.env.NEXTAUTH_URL}/invite/${result.invitation.invitationToken}`
          : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Provisioning failed";
    console.error("[provision] error:", err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
