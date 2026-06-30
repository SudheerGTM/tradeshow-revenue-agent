import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, gt } from "drizzle-orm";
import { logAudit, getRequestIp } from "@/lib/audit";
import { validateWorkEmail } from "@/lib/email-validation";
import { emailProvider, accessRequestConfirmationEmail } from "@/lib/email";
import { notifyAdminOfAccessRequest } from "@/lib/agents/tenant-provisioning-agent";

// In-memory rate limiting (per server process).
// Production has a single container, so this is sufficient.
// Replace with Redis when scaling horizontally.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 3; // max requests per IP per window
const ipBuckets = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
    return true; // allowed
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false; // blocked
  bucket.count++;
  return true;
}

// POST /api/access-requests — public, no auth required
export async function POST(req: NextRequest) {
  const ip = getRequestIp(req) ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "";

  // Rate limit
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    companyName,
    companyWebsite,
    contactName,
    contactEmail,
    phone,
    country,
    eventName,
    expectedUsers,
    crmSystem,
    useCase,
    message,
    // Honeypot: bots fill this invisible field, humans leave it blank
    _hp,
  } = body as Record<string, unknown>;

  const honeypotTriggered = !!_hp;

  // Validate required fields — return generic errors only
  if (!companyName || typeof companyName !== "string" || companyName.trim().length < 2) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }
  if (!contactName || typeof contactName !== "string" || contactName.trim().length < 2) {
    return NextResponse.json({ error: "Contact name is required." }, { status: 400 });
  }
  if (!contactEmail || typeof contactEmail !== "string") {
    return NextResponse.json({ error: "Work email is required." }, { status: 400 });
  }

  // Work email validation
  const emailCheck = validateWorkEmail(contactEmail);
  if (!emailCheck.ok) {
    const messages: Record<string, string> = {
      invalid_format: "Please enter a valid email address.",
      disposable_domain: "Please use a permanent work email address.",
      free_consumer_email: "Please use your work email address (not Gmail, Yahoo, etc.).",
    };
    return NextResponse.json(
      { error: messages[emailCheck.reason] ?? "Please use a valid work email." },
      { status: 400 }
    );
  }

  const normalizedEmail = (contactEmail as string).trim().toLowerCase();

  // Duplicate check: active (non-rejected) request for the same email in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [existingRequest] = await db
    .select({ id: schema.tenantAccessRequests.id, status: schema.tenantAccessRequests.status })
    .from(schema.tenantAccessRequests)
    .where(
      and(
        eq(schema.tenantAccessRequests.contactEmail, normalizedEmail),
        gt(schema.tenantAccessRequests.createdAt, thirtyDaysAgo)
      )
    )
    .limit(1);

  if (existingRequest && existingRequest.status !== "rejected") {
    // Return success to the user — no need to reveal we already have the request
    return NextResponse.json(
      { message: "Your request has been received. We'll be in touch shortly." },
      { status: 202 }
    );
  }

  // Insert record (even if honeypot triggered — we store it but won't action it)
  const [request] = await db
    .insert(schema.tenantAccessRequests)
    .values({
      companyName:       (companyName as string).trim(),
      companyWebsite:    typeof companyWebsite === "string" ? companyWebsite.trim() || null : null,
      contactName:       (contactName as string).trim(),
      contactEmail:      normalizedEmail,
      phone:             typeof phone === "string" ? phone.trim() || null : null,
      country:           typeof country === "string" ? country.trim() || null : null,
      eventName:         typeof eventName === "string" ? eventName.trim() || null : null,
      expectedUsers:     typeof expectedUsers === "number" ? expectedUsers : null,
      crmSystem:         typeof crmSystem === "string" ? crmSystem.trim() || null : null,
      useCase:           typeof useCase === "string" ? useCase.trim() || null : null,
      message:           typeof message === "string" ? message.trim() || null : null,
      honeypotTriggered,
      ipAddress:         ip,
      userAgent:         userAgent.slice(0, 512),
      status:            "requested",
    })
    .returning();

  // Audit log
  await logAudit({
    action: "access_request_submitted",
    resourceType: "tenant_access_request",
    resourceId: request.id,
    metadata: {
      companyName: request.companyName,
      contactEmail: request.contactEmail,
      honeypotTriggered,
    },
    ipAddress: ip,
  });

  // If honeypot triggered, silently drop — don't send emails, don't error
  if (honeypotTriggered) {
    return NextResponse.json(
      { message: "Your request has been received. We'll be in touch shortly." },
      { status: 202 }
    );
  }

  // Send confirmation to prospect (best-effort)
  emailProvider
    .send(
      accessRequestConfirmationEmail({
        to: normalizedEmail,
        contactName: (contactName as string).trim(),
        companyName: (companyName as string).trim(),
      })
    )
    .catch((err) => console.error("[access-requests] confirmation email error:", err));

  // Notify platform admin (best-effort, async)
  notifyAdminOfAccessRequest({
    requestId:     request.id,
    contactName:   request.contactName,
    contactEmail:  request.contactEmail,
    companyName:   request.companyName,
    companyWebsite: request.companyWebsite,
    eventName:     request.eventName,
    expectedUsers: request.expectedUsers,
    crmSystem:     request.crmSystem,
    useCase:       request.useCase,
    message:       request.message,
  }).catch(() => {});

  return NextResponse.json(
    { message: "Your request has been received. We'll be in touch shortly." },
    { status: 202 }
  );
}
