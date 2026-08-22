// Release 14.3.1 — single source of truth for the *displayed* event status.
//
// events.status (schema.ts) is a separate, stored lifecycle value — it still
// governs "cancelled" and (via settings/tenant/page.tsx's `status = "active"`
// query) which event is highlighted as the tenant's "current event". This
// file does NOT read or change that column; it derives a purely presentational
// Upcoming/Ongoing/Completed label from start/end dates, shown alongside (or
// in place of) the stored status badge. See docs/ICP-ARCHITECTURE.md and
// docs/RELEASE-14.3.1-HARDENING.md for the rationale.
//
// Dates are plain "YYYY-MM-DD" calendar strings (Drizzle `date()` columns,
// no time-of-day). Comparing them lexicographically as strings — rather than
// building Date objects and comparing epoch millis — is what keeps this
// timezone-safe and server/client-consistent: there's no local-offset
// arithmetic to disagree about, just calendar-day string comparison.

export type DerivedEventStatus = "upcoming" | "ongoing" | "completed";

function todayISODate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Derives Upcoming / Ongoing / Completed from start/end dates (inclusive on
 * both ends). Returns null when neither date is set — nothing to derive.
 * Does not know about `cancelled` — callers should check the stored
 * lifecycle status first and only fall back to this for display.
 */
export function deriveEventStatus(
  startDate: string | null,
  endDate: string | null,
  now: Date = new Date()
): DerivedEventStatus | null {
  if (!startDate && !endDate) return null;
  const today = todayISODate(now);
  if (startDate && today < startDate) return "upcoming";
  if (endDate && today > endDate) return "completed";
  return "ongoing";
}

export const EVENT_STATUS_LABELS: Record<DerivedEventStatus, string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Completed",
};

export const EVENT_STATUS_COLORS: Record<DerivedEventStatus, "green" | "blue" | "gray" | "red"> = {
  upcoming: "blue",
  ongoing: "green",
  completed: "gray",
};

/**
 * The single function display components should call: stored `cancelled`
 * always wins: everything else is date-derived. Returns a label + Badge
 * color pair.
 */
export function getEventDisplayStatus(
  event: { status: string; startDate: string | null; endDate: string | null },
  now: Date = new Date()
): { label: string; color: "green" | "blue" | "gray" | "red" } {
  if (event.status === "cancelled") return { label: "Cancelled", color: "red" };
  const derived = deriveEventStatus(event.startDate, event.endDate, now);
  if (!derived) return { label: "Upcoming", color: "blue" };
  return { label: EVENT_STATUS_LABELS[derived], color: EVENT_STATUS_COLORS[derived] };
}
