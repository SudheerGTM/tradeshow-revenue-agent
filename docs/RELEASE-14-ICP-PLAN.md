# Release 14 — Configurable ICP Foundation (superseded, see below)

**This file is retired. Do not read further, and do not treat anything below this line as current.**

It was an early Release 14 draft, superseded 2026-08-18 by a fresh code inspection that found more hardcoded ICP logic than this draft assumed (notably `src/components/lead-detail/CompanyIntelTab.tsx`'s independent, already-diverged fit calculation) and that proposed admin-editable scoring weights — a scope the user explicitly declined for R14.2.

Read instead:
- **[docs/RELEASE-14-CONFIGURABLE-ICP.md](RELEASE-14-CONFIGURABLE-ICP.md)** — the current R14.1 assessment (what's hardcoded, why, the approved data model) and R14.2 completion note.
- **[docs/ICP-ARCHITECTURE.md](ICP-ARCHITECTURE.md)** — what R14.2 actually built: schema, resolver, the duplicate-logic fix, test results, production migration plan.
- **[PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md) §19** — current status summary.

This file is kept only so old links don't 404. It will not be updated further.
