// Common disposable / free consumer email domains that are not work emails.
// This list covers the most common offenders; it is not exhaustive.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.biz", "guerrillamail.de", "guerrillamail.info",
  "trashmail.com", "trashmail.net", "trashmail.me", "trashmail.io",
  "tempmail.com", "temp-mail.org", "tempinbox.com",
  "throwam.com", "throwam.net", "dispostable.com",
  "sharklasers.com", "guerrillamailblock.com", "grr.la", "spam4.me",
  "yopmail.com", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf",
  "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr",
  "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf",
  "monmail.fr.nf", "fakeinbox.com", "maildrop.cc",
  "10minutemail.com", "10minutemail.net", "10minutemail.org",
  "20minutemail.com", "minutemailbox.com",
  "mailnull.com", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  "spamex.com", "spamhereplease.com", "spaml.de",
]);

// Free consumer email providers — not disposable but not "work" email.
const FREE_CONSUMER_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "yahoo.fr", "yahoo.de", "yahoo.es",
  "yahoo.com.au", "yahoo.com.br", "yahoo.com.mx", "yahoo.com.ar",
  "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.es",
  "hotmail.com.au", "hotmail.com.br",
  "outlook.com", "outlook.co.uk", "outlook.fr", "outlook.de",
  "live.com", "live.co.uk", "live.fr", "live.de",
  "msn.com",
  "aol.com", "aim.com",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "protonmail.ch", "pm.me",
  "zoho.com",
]);

export type EmailValidationResult =
  | { ok: true }
  | { ok: false; reason: "invalid_format" | "disposable_domain" | "free_consumer_email" };

export function validateWorkEmail(email: string): EmailValidationResult {
  const trimmed = email.trim().toLowerCase();

  // Basic format check
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx < 1 || atIdx === trimmed.length - 1) {
    return { ok: false, reason: "invalid_format" };
  }
  const domain = trimmed.slice(atIdx + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return { ok: false, reason: "invalid_format" };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: "disposable_domain" };
  }

  if (FREE_CONSUMER_DOMAINS.has(domain)) {
    return { ok: false, reason: "free_consumer_email" };
  }

  return { ok: true };
}
