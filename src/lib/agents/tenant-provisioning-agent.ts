/**
 * Tenant Provisioning Agent — Release 13.8
 *
 * Provisions a new tenant (+ default event + tenant admin invitation) from an
 * approved access request. Must ONLY be called after a platform_admin has
 * explicitly approved the request. Never called directly from the public form.
 *
 * Provisioning is idempotent: re-calling for an already-provisioned request
 * returns the existing tenant without creating duplicates.
 */

import crypto from "crypto";
import { db, schema } from "@/db";
import { eq, or } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { emailProvider, accessRequestApprovedEmail, invitationEmail } from "@/lib/email";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "info@gtmtechsol.com";

export interface ProvisioningResult {
  tenant: typeof schema.tenants.$inferSelect;
  invitation: typeof schema.userInvitations.$inferSelect;
  emailResults: {
    approvalEmail: "sent" | "failed" | "sandbox_blocked";
    invitationEmail: "sent" | "failed" | "sandbox_blocked";
  };
  wasAlreadyProvisioned: boolean;
}

/**
 * Derives a URL-safe slug from a company name, appending a numeric suffix
 * if the base slug is already taken.
 */
async function generateUniqueSlug(companyName: string): Promise<{ slug: string; subdomain: string }> {
  const base = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt}`;

    const [existing] = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(or(eq(schema.tenants.slug, candidate), eq(schema.tenants.subdomain, candidate)))
      .limit(1);

    if (!existing) return { slug: candidate, subdomain: candidate };
  }

  // Fallback: append a random suffix
  const rand = crypto.randomBytes(3).toString("hex");
  return { slug: `${base}-${rand}`, subdomain: `${base}-${rand}` };
}

async function trySendEmail(fn: () => Promise<void>): Promise<"sent" | "failed" | "sandbox_blocked"> {
  try {
    await fn();
    return "sent";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // SES sandbox blocks delivery to unverified addresses
    if (
      msg.includes("MessageRejected") ||
      msg.includes("Email address is not verified") ||
      msg.includes("sandbox")
    ) {
      console.warn("[provisioning] SES sandbox blocked email:", msg);
      return "sandbox_blocked";
    }
    console.error("[provisioning] email send error:", err);
    return "failed";
  }
}

export async function provisionTenantFromAccessRequest(
  requestId: string,
  approvedByUserId: string
): Promise<ProvisioningResult> {
  // 1. Load and validate the request
  const [request] = await db
    .select()
    .from(schema.tenantAccessRequests)
    .where(eq(schema.tenantAccessRequests.id, requestId))
    .limit(1);

  if (!request) throw new Error(`Access request not found: ${requestId}`);
  if (request.status !== "approved" && request.status !== "provisioned") {
    throw new Error(`Request ${requestId} is in status '${request.status}' — must be 'approved' before provisioning.`);
  }

  // 2. Idempotency: already provisioned → return existing data
  if (request.status === "provisioned" && request.createdTenantId) {
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, request.createdTenantId))
      .limit(1);

    const [invitation] = await db
      .select()
      .from(schema.userInvitations)
      .where(eq(schema.userInvitations.tenantId, request.createdTenantId))
      .limit(1);

    if (tenant && invitation) {
      return {
        tenant,
        invitation,
        emailResults: { approvalEmail: "sent", invitationEmail: "sent" },
        wasAlreadyProvisioned: true,
      };
    }
  }

  // 3. Check for duplicate tenant (same company website domain)
  if (request.companyWebsite) {
    try {
      const domain = new URL(
        request.companyWebsite.startsWith("http") ? request.companyWebsite : `https://${request.companyWebsite}`
      ).hostname.replace(/^www\./, "");

      const existing = await db
        .select({ id: schema.tenants.id, name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.slug, domain.replace(/\./g, "-")))
        .limit(1);

      if (existing.length) {
        console.warn(`[provisioning] potential duplicate tenant for domain ${domain} (existing: ${existing[0].id})`);
        // Log the warning but do not block — admin already approved
      }
    } catch {
      // malformed URL — skip duplicate check
    }
  }

  // 4. Generate slug + subdomain
  const { slug, subdomain } = await generateUniqueSlug(request.companyName);

  // 5. Run the full provisioning in a transaction
  const { tenant, invitation } = await db.transaction(async (tx) => {
    // 5a. Create tenant
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        name: request.companyName,
        slug,
        subdomain,
        eventName: request.eventName ?? null,
        status: "active",
      })
      .returning();

    // 5b. Create default event (if event name provided)
    if (request.eventName) {
      const eventSlug = request.eventName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);

      await tx.insert(schema.events).values({
        tenantId: tenant.id,
        name: request.eventName,
        slug: eventSlug,
        status: "upcoming",
      });
    }

    // 5c. Create tenant admin invitation
    const token = crypto.randomBytes(32).toString("hex");
    const [invitation] = await tx
      .insert(schema.userInvitations)
      .values({
        tenantId: tenant.id,
        email: request.contactEmail,
        firstName: request.contactName.split(" ")[0],
        lastName: request.contactName.split(" ").slice(1).join(" ") || undefined,
        role: "tenant_admin",
        eventAccess: "all",
        message: `Welcome to your ${request.companyName} workspace on Trade Show Revenue Agent.`,
        invitationToken: token,
        status: "pending",
        expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
        invitedBy: approvedByUserId,
      })
      .returning();

    // 5d. Mark request as provisioned
    await tx
      .update(schema.tenantAccessRequests)
      .set({
        status: "provisioned",
        createdTenantId: tenant.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenantAccessRequests.id, requestId));

    // 5e. Audit log — tenant_provisioned
    await logAudit(
      {
        tenantId: tenant.id,
        userId: approvedByUserId,
        action: "tenant_provisioned",
        resourceType: "tenant",
        resourceId: tenant.id,
        metadata: {
          requestId,
          companyName: request.companyName,
          contactEmail: request.contactEmail,
          slug,
        },
      },
      tx
    );

    // 5f. Audit log — tenant_admin_invited
    await logAudit(
      {
        tenantId: tenant.id,
        userId: approvedByUserId,
        action: "tenant_admin_invited",
        resourceType: "user_invitation",
        resourceId: invitation.id,
        metadata: { email: request.contactEmail, role: "tenant_admin" },
      },
      tx
    );

    return { tenant, invitation };
  });

  // 6. Send emails (outside transaction — failures must not roll back provisioning)
  const inviteUrl = `${BASE_URL}/invite/${invitation.invitationToken}`;
  const adminReviewUrl = `${BASE_URL}/admin/access-requests/${requestId}`;

  const approvalEmailResult = await trySendEmail(() =>
    emailProvider.send(
      accessRequestApprovedEmail({
        to: request.contactEmail,
        contactName: request.contactName,
        companyName: request.companyName,
        inviteUrl,
      })
    )
  );

  const invitationEmailResult = await trySendEmail(() =>
    emailProvider.send(
      invitationEmail({
        to: request.contactEmail,
        firstName: request.contactName.split(" ")[0],
        tenantName: request.companyName,
        invitedByName: "Trade Show Revenue Agent",
        inviteUrl,
      })
    )
  );

  // 7. Log email outcomes for admin visibility
  console.info("[provisioning] tenant=%s email_approval=%s email_invite=%s review=%s",
    tenant.id, approvalEmailResult, invitationEmailResult, adminReviewUrl);

  if (approvalEmailResult !== "sent" || invitationEmailResult !== "sent") {
    console.warn(
      `[provisioning] One or more emails failed/blocked for ${request.contactEmail}. ` +
      `Admin should send invitation manually from: ${adminReviewUrl}` +
      ` (invite token is valid for 7 days). SES sandbox: ensure ${request.contactEmail} is a verified address.`
    );
  }

  return {
    tenant,
    invitation,
    emailResults: {
      approvalEmail: approvalEmailResult,
      invitationEmail: invitationEmailResult,
    },
    wasAlreadyProvisioned: false,
  };
}

/**
 * Notify the platform admin about a new access request.
 * Called after the public form submission — not part of the provisioning flow.
 * Failures are logged but do not fail the request submission.
 */
export async function notifyAdminOfAccessRequest(params: {
  requestId: string;
  contactName: string;
  contactEmail: string;
  companyName: string;
  companyWebsite?: string | null;
  eventName?: string | null;
  expectedUsers?: number | null;
  crmSystem?: string | null;
  useCase?: string | null;
  message?: string | null;
}): Promise<void> {
  const reviewUrl = `${BASE_URL}/admin/access-requests/${params.requestId}`;
  try {
    const { accessRequestAdminNotificationEmail } = await import("@/lib/email");
    await emailProvider.send(
      accessRequestAdminNotificationEmail({
        to: ADMIN_EMAIL,
        contactName: params.contactName,
        contactEmail: params.contactEmail,
        companyName: params.companyName,
        companyWebsite: params.companyWebsite ?? undefined,
        eventName: params.eventName ?? undefined,
        expectedUsers: params.expectedUsers ?? undefined,
        crmSystem: params.crmSystem ?? undefined,
        useCase: params.useCase ?? undefined,
        message: params.message ?? undefined,
        reviewUrl,
      })
    );
  } catch (err) {
    console.error("[provisioning] failed to notify admin of access request:", err);
  }
}
