# 14 — Coding Standards

These are the conventions **actually followed in the codebase today**, observed by inspection — not an aspirational style guide. Match them when adding new code.

## Naming

- **Files:** `kebab-case.ts` for libraries (`lead-scoring.ts`, `event-access.ts`), `PascalCase.tsx` for React components (`VoiceRecorder.tsx`, `BusinessCardScanner.tsx`).
- **API route folders:** kebab-case matching the URL path exactly (`/api/voice-notes` → `src/app/api/voice-notes/`). Consistently applied — no mixed casing found across ~66 routes.
- **Database columns:** `snake_case` in Postgres, mapped to `camelCase` in Drizzle's TS schema (standard Drizzle convention) — e.g. `created_by_user_id` ↔ `createdByUserId`.
- **Permission helper functions:** mixed `is*`/`can*` prefix style (`isPlatformAdmin`, `canAssignRole`) — both are in active use; follow whichever reads more naturally for a new check (predicate → `is*`, action-permission → `can*`).
- **React components:** one default export per file, named to match the filename.

## TypeScript usage

- Strict mode is on (project `tsconfig.json`). New code should not introduce `any` without a specific reason — none of the files reviewed during the code-inspection scan had stray `any` usage.
- Drizzle's inferred types (`typeof table.$inferSelect`/`$inferInsert`) are exported from `schema.ts` and imported wherever a row shape is needed — don't hand-write duplicate interfaces for table rows.
- API route handlers type their destructured request body inline (`const { x, y } = body as { x: string; y?: number }`) rather than separate request DTO files — follow this pattern for new routes.

## API conventions

- Every route checks `await auth()` first and returns `401` immediately if null (except the small set of explicitly public routes — capture, invitations/accept, forgot/reset-password).
- Error responses are always `{ error: string }` with an appropriate status code (400/401/403/404/409/422/502) — confirmed consistent across all sampled routes.
- Success responses return the affected resource directly (not wrapped in `{ data: ... }`), except list endpoints which return either a bare array or `{ items, page, limit }`-shaped pagination — match whichever pattern the sibling routes in that feature area use.
- Audit-worthy mutations call `logAudit()` (`src/lib/audit.ts`) with `tenantId`, `userId`, `action`, `resourceType`, `resourceId`, and `ipAddress` via `getRequestIp(req)`.

## Database/query conventions

- All multi-tenant queries filter by `tenantId` from the session, never from client input (see [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)) — this is a hard rule, not a style preference.
- `sql\`...\`` template literals are used for conditions Drizzle's builder doesn't directly express (e.g. `is not null` on a computed comparison) — always interpolate via `${column}`, never string-concatenate user input into a `sql` template. The code-inspection scan found zero violations of this; keep it that way.
- New tables get a numbered migration file in `drizzle/` — see [09-deployment-guide.md](09-deployment-guide.md).

## Error handling

- Try/catch around external API calls (Gemini, Apollo, HubSpot, AWS), with errors translated into specific user-facing strings where the failure mode is known (rate limit, invalid key) and a generic message otherwise.
- AI/agent failures don't necessarily fail the whole request — see the `needs_human_review`/`needs_review` pattern across Conversation Intelligence, Enrichment, and Lead Scoring: a confidence-too-low result is a valid (if degraded) outcome, not an exception.
- The orchestrator distinguishes failure types (`temporary`/`validation`/`permission`) for retry eligibility — see [06-ai-agent-architecture.md](06-ai-agent-architecture.md).

## Comments

Default to no comments. The codebase's existing comments are reserved for non-obvious *why*, not *what* — e.g. the note in `voiceNotes.fileSizeBytes` schema definition explaining it's `text` "to avoid bigint friction," or the comment in `business-cards/delete/route.ts` acknowledging that `deleteAudioFile()` is generic despite its audio-specific name. Match this — don't add comments that restate what the code already says via naming.

## Formatting

No Prettier config or `.editorconfig` found in the repo — formatting consistency relies on editor defaults + ESLint (`npm run lint`). Run lint before committing; there's no pre-commit hook enforcing it currently.

## Standards for future development

- **Prefer extending an existing agent/lib file's pattern over inventing a new one** — e.g. a new agent should follow the `AgentAdapter` shape in `src/lib/orchestrator/types.ts`, not a bespoke structure.
- **Don't add a raw-password code path back into user management** — this was deliberately removed (see [07-authentication-security.md](07-authentication-security.md)); any password-setting flow must go through the token-based reset mechanism.
- **Don't relax tenant-scoping** on a query without a very explicit reason (and call it out in the PR) — see [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md).
- If you find yourself duplicating the initiate-upload/complete-upload pattern for a third file type, extract the shared helper instead — see `code-inspection-report.md` for the existing duplication between voice-notes and business-cards that should have been a signal to do this already.
