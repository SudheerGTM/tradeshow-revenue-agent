export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Provider seam — implement this for SES, Resend, SendGrid, etc. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
