import type { EmailMessage, EmailProvider } from "./types";

/** Default provider — logs instead of sending. Used when EMAIL_PROVIDER isn't set to "ses". */
export class ConsoleProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}
