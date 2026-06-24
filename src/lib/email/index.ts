import type { EmailProvider } from "./types";
import { ConsoleProvider } from "./console";
import { SesProvider } from "./ses";

export const emailProvider: EmailProvider =
  process.env.EMAIL_PROVIDER === "ses" ? new SesProvider() : new ConsoleProvider();

export * from "./templates";
export type { EmailMessage, EmailProvider } from "./types";
