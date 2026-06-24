import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { EmailMessage, EmailProvider } from "./types";

let _client: SESClient | null = null;

function getClient(): SESClient {
  if (!_client) {
    _client = new SESClient({
      region: process.env.AWS_REGION!,
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          }
        : undefined, // falls back to the instance role when not set (production)
    });
  }
  return _client;
}

export class SesProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const fromEmail = process.env.EMAIL_FROM ?? "noreply@gtmtechsol.ai";
    const cmd = new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [message.to] },
      Message: {
        Subject: { Data: message.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: message.html, Charset: "UTF-8" },
          Text: { Data: message.text, Charset: "UTF-8" },
        },
      },
    });
    await getClient().send(cmd);
  }
}
