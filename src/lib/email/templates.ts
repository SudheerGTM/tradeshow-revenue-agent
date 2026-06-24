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
