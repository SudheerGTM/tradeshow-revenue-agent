# 15 — Testing Guide

For a concrete, ordered, click-by-click script covering the entire application (auth, all four lead-capture entry points, the full agent pipeline, CRM sync, opportunities/pipeline, ROI, admin/IAM, multi-tenant isolation, mobile, deployment verification), see [e2e-testing-guide.md](e2e-testing-guide.md). This page describes the *philosophy and general practice* of how testing is done here; that page is the *runbook*.

**There is no automated test suite in this repository** — no Jest/Vitest config, no `*.test.ts` files, no CI pipeline running tests. Every verification described in this project's history has been manual, browser-driven, or direct API/database inspection. This doc describes how that manual verification has actually been done, so it's repeatable — it is not describing an automated framework that exists.

## Manual testing (the actual current practice)

1. `npm run build` first, always — this is the closest thing to a regression check that exists; it catches type errors and broken imports across the whole app.
2. Start the dev server, log in as a seeded demo user matching the role you're testing.
3. Drive the feature through the browser exactly as a user would — fill forms, click buttons, follow redirects.
4. Cross-check the database directly (`psql`) to confirm the expected row/column changes actually happened — don't trust the UI alone, especially for anything touching audit logs or financial numbers.

## Feature testing checklist (by area)

- **Lead capture:** test all four entry points (manual, QR badge scan, business card OCR, public form) and confirm `source` is set correctly on the resulting lead.
- **Agent pipeline:** trigger each agent individually via its API route, then trigger the full orchestrator workflow, and confirm `workflow_runs`/`agent_executions` rows match what you'd expect from the step sequence.
- **CRM sync:** confirm `prepare` never writes to HubSpot (check HubSpot directly, not just the app's DB) — only `approve` should.
- **IAM:** invite a user, accept via the emailed/logged token, confirm login works; trigger 5 failed logins and confirm lockout; unlock and confirm recovery; reset a password via both self-service and admin-initiated paths and confirm reuse-of-last-5 is rejected.

## Regression testing

No automated regression suite exists. In practice, regression checking has meant: after any schema or auth change, re-run the full login → dashboard → leads → lead detail tab-by-tab click-through manually, since a broken `auth.ts` callback (the `session.user.id` bug — see [07-authentication-security.md](07-authentication-security.md)) can silently corrupt data (`createdByUserId` writing `null`) without any visible error in the UI.

## Mobile testing

Done via the browser preview tool's responsive resize, plus real-device testing for camera-dependent features (QR scanning, business card photo capture) — these specifically needed real iPhone testing, since a known iOS Safari `getUserMedia` bug (black video preview) only reproduced on a real device, not in headless/desktop preview. See [16-troubleshooting.md](16-troubleshooting.md).

## Multi-tenant testing

Manually verified by logging in as users from different tenants/roles and confirming data doesn't leak across tenant boundaries, and that `booth_user` only sees their own records within a tenant. No automated tenant-isolation test exists — this is asserted by code review (see the tenant-scoping audit referenced in [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)), not by a test suite.

## Security testing

Ad hoc: attempted SQL injection patterns were checked by inspection (confirmed all `sql\`` usage is parameterized — see `code-inspection-report.md`), and the account lockout/password policy were verified by actually triggering them (5 failed logins, weak/reused passwords) rather than just reading the code.

## Integration testing

External services (Gemini, Apollo, HubSpot, AWS) have been tested against their real APIs during development — there is no mock/stub layer, so "integration testing" here means literally calling the real third-party API with real (test/sandbox) credentials and inspecting the response.

## Deployment verification

After every production deploy: `curl https://<domain>/login` for a 200, then a real login as a seeded user, then spot-checks of whatever feature just changed via the actual public domain (not just the EC2 instance's local port). See [09-deployment-guide.md](09-deployment-guide.md).

## What to add eventually (not built yet)

See [19-known-limitations.md](19-known-limitations.md) — no unit tests, no integration test suite, no CI. This is real technical debt, not an oversight in this document.
