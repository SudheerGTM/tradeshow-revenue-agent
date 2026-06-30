import type { EmailMessage } from "./types";

const BRAND_BLUE = "#0F4C81";
const BRAND_TURQUOISE = "#00B8D9";

function wrap(bodyHtml: string, bodyText: string): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
            <tr>
              <td style="background-color:${BRAND_BLUE};padding:20px 24px;">
                <span style="color:#ffffff;font-size:16px;font-weight:700;">Trade Show Revenue Agent</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;color:#0F172A;font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;">
                <span style="color:#94A3B8;font-size:11px;">GTM Technology Solutions · This is an automated message.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { html, text: bodyText };
}

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:16px;background-color:${BRAND_TURQUOISE};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;">${label}</a>`;
}

export function invitationEmail(params: {
  to: string;
  firstName: string;
  tenantName: string;
  invitedByName: string;
  inviteUrl: string;
  message?: string;
}): EmailMessage {
  const { html, text } = wrap(
    `<p>Hi ${params.firstName},</p>
     <p><strong>${params.invitedByName}</strong> has invited you to join <strong>${params.tenantName}</strong> on Trade Show Revenue Agent.</p>
     ${params.message ? `<p style="background:#F8FAFC;border-left:3px solid ${BRAND_TURQUOISE};padding:10px 14px;border-radius:6px;color:#475569;">${params.message}</p>` : ""}
     <p>Click below to set your password and activate your account. This link expires in 7 days.</p>
     ${button("Activate Your Account", params.inviteUrl)}`,
    `Hi ${params.firstName},\n\n${params.invitedByName} has invited you to join ${params.tenantName} on Trade Show Revenue Agent.\n\nActivate your account: ${params.inviteUrl}\n\nThis link expires in 7 days.`
  );
  return { to: params.to, subject: "You've been invited to Trade Show Revenue Agent", html, text };
}

export function passwordResetEmail(params: { to: string; firstName: string; resetUrl: string }): EmailMessage {
  const { html, text } = wrap(
    `<p>Hi ${params.firstName},</p>
     <p>We received a request to reset your password. This link expires in 1 hour.</p>
     ${button("Reset Password", params.resetUrl)}
     <p style="color:#94A3B8;font-size:12px;margin-top:16px;">If you didn't request this, you can safely ignore this email.</p>`,
    `Hi ${params.firstName},\n\nWe received a request to reset your password. This link expires in 1 hour.\n\nReset your password: ${params.resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`
  );
  return { to: params.to, subject: "Reset your Trade Show Revenue Agent password", html, text };
}

export function accountActivatedEmail(params: { to: string; firstName: string; tenantName: string }): EmailMessage {
  const { html, text } = wrap(
    `<p>Hi ${params.firstName},</p>
     <p>Your account for <strong>${params.tenantName}</strong> is now active. Welcome aboard!</p>`,
    `Hi ${params.firstName},\n\nYour account for ${params.tenantName} is now active. Welcome aboard!`
  );
  return { to: params.to, subject: "Your account is activated", html, text };
}

// ─── Tenant Access Request emails ─────────────────────────────────────────────

export function accessRequestConfirmationEmail(params: {
  to: string;
  contactName: string;
  companyName: string;
}): EmailMessage {
  const firstName = params.contactName.split(" ")[0];
  const { html, text } = wrap(
    `<p>Hi ${firstName},</p>
     <p>Thank you for requesting access to <strong>Trade Show Revenue Agent</strong>.</p>
     <p>We've received your request for <strong>${params.companyName}</strong> and our team will review it shortly. You'll receive an email once a decision has been made.</p>
     <p style="color:#94A3B8;font-size:12px;margin-top:16px;">If you didn't submit this request, you can safely ignore this email.</p>`,
    `Hi ${firstName},\n\nThank you for requesting access to Trade Show Revenue Agent.\n\nWe've received your request for ${params.companyName} and our team will review it shortly. You'll receive an email once a decision has been made.\n\nIf you didn't submit this request, you can safely ignore this email.`
  );
  return {
    to: params.to,
    subject: "We received your Trade Show Revenue Agent access request",
    html,
    text,
  };
}

export function accessRequestAdminNotificationEmail(params: {
  to: string;
  contactName: string;
  contactEmail: string;
  companyName: string;
  companyWebsite?: string;
  eventName?: string;
  expectedUsers?: number;
  crmSystem?: string;
  useCase?: string;
  message?: string;
  reviewUrl: string;
}): EmailMessage {
  const { html, text } = wrap(
    `<p>A new access request has been submitted.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
       <tr><td style="padding:4px 0;color:#94A3B8;width:140px;">Name</td><td><strong>${params.contactName}</strong></td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Email</td><td>${params.contactEmail}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Company</td><td>${params.companyName}</td></tr>
       ${params.companyWebsite ? `<tr><td style="padding:4px 0;color:#94A3B8;">Website</td><td>${params.companyWebsite}</td></tr>` : ""}
       ${params.eventName ? `<tr><td style="padding:4px 0;color:#94A3B8;">Event</td><td>${params.eventName}</td></tr>` : ""}
       ${params.expectedUsers ? `<tr><td style="padding:4px 0;color:#94A3B8;">Expected users</td><td>${params.expectedUsers}</td></tr>` : ""}
       ${params.crmSystem ? `<tr><td style="padding:4px 0;color:#94A3B8;">CRM system</td><td>${params.crmSystem}</td></tr>` : ""}
     </table>
     ${params.useCase ? `<p style="margin-top:12px;"><strong>Use case:</strong><br/>${params.useCase}</p>` : ""}
     ${params.message ? `<p><strong>Message:</strong><br/>${params.message}</p>` : ""}
     ${button("Review Request", params.reviewUrl)}`,
    `New access request from ${params.contactName} (${params.contactEmail}) at ${params.companyName}.\n\nReview: ${params.reviewUrl}`
  );
  return {
    to: params.to,
    subject: `New Trade Show Revenue Agent access request — ${params.companyName}`,
    html,
    text,
  };
}

export function accessRequestApprovedEmail(params: {
  to: string;
  contactName: string;
  companyName: string;
  inviteUrl: string;
}): EmailMessage {
  const firstName = params.contactName.split(" ")[0];
  const { html, text } = wrap(
    `<p>Hi ${firstName},</p>
     <p>Great news — your access request for <strong>Trade Show Revenue Agent</strong> has been approved!</p>
     <p>Your workspace for <strong>${params.companyName}</strong> is ready. Click below to set your password and log in.</p>
     ${button("Activate Your Workspace", params.inviteUrl)}
     <p style="color:#94A3B8;font-size:12px;margin-top:16px;">This invitation link expires in 7 days.</p>`,
    `Hi ${firstName},\n\nYour access request has been approved!\n\nActivate your workspace for ${params.companyName}: ${params.inviteUrl}\n\nThis link expires in 7 days.`
  );
  return {
    to: params.to,
    subject: "Your Trade Show Revenue Agent workspace is ready",
    html,
    text,
  };
}

export function accessRequestRejectedEmail(params: {
  to: string;
  contactName: string;
  companyName: string;
  reason?: string;
}): EmailMessage {
  const firstName = params.contactName.split(" ")[0];
  const { html, text } = wrap(
    `<p>Hi ${firstName},</p>
     <p>Thank you for your interest in Trade Show Revenue Agent.</p>
     <p>Unfortunately, we are unable to approve your access request for <strong>${params.companyName}</strong> at this time.</p>
     ${params.reason ? `<p style="background:#F8FAFC;border-left:3px solid #CBD5E1;padding:10px 14px;border-radius:6px;color:#475569;">${params.reason}</p>` : ""}
     <p>If you have questions, please contact us at <a href="mailto:info@gtmtechsol.com" style="color:${BRAND_BLUE};">info@gtmtechsol.com</a>.</p>`,
    `Hi ${firstName},\n\nWe were unable to approve your access request for ${params.companyName} at this time.${params.reason ? `\n\nReason: ${params.reason}` : ""}\n\nFor questions: info@gtmtechsol.com`
  );
  return {
    to: params.to,
    subject: "Update on your Trade Show Revenue Agent access request",
    html,
    text,
  };
}

export function accountSuspendedEmail(params: { to: string; firstName: string; tenantName: string; reason?: string }): EmailMessage {
  const { html, text } = wrap(
    `<p>Hi ${params.firstName},</p>
     <p>Your account for <strong>${params.tenantName}</strong> has been suspended.</p>
     ${params.reason ? `<p style="color:#475569;">Reason: ${params.reason}</p>` : ""}
     <p>Contact your tenant administrator if you believe this is in error.</p>`,
    `Hi ${params.firstName},\n\nYour account for ${params.tenantName} has been suspended.${params.reason ? ` Reason: ${params.reason}` : ""}\n\nContact your tenant administrator if you believe this is in error.`
  );
  return { to: params.to, subject: "Your account has been suspended", html, text };
}
