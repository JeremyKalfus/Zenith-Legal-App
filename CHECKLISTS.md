# Definition of Done Checklists

> Based on tooling in this repo: ESLint, TypeScript, Vitest, GitHub Actions CI, Supabase CLI.

## Feature Change

- [ ] Code follows existing patterns and conventions in the codebase.
- [ ] `npm run lint` passes across all workspaces.
- [ ] `npm run typecheck` passes across all workspaces.
- [ ] `npm run test` passes across all workspaces.
- [ ] New code has unit tests for non-trivial logic.
- [ ] Manual testing performed (describe flows tested).
- [ ] No secrets or credentials in committed files.
- [ ] Commit message is scoped and descriptive.
- [ ] Root docs updated if applicable (see `AGENTS.md` doc update policy).

## Backend / Edge Function Change

- [ ] All items from Feature Change checklist.
- [ ] Edge function uses `getCurrentUserId()` or `assertStaff()` for auth (not raw `getUser()`).
- [ ] Error responses use proper HTTP status codes (401 for auth, 403 for forbidden, 400/422 for validation).
- [ ] `supabase/config.toml` updated if a new function is added (set `verify_jwt = false`).
- [ ] Edge functions deployed to hosted Supabase: `supabase functions deploy`.
- [ ] Audit events written for privileged operations via `writeAuditEvent()`.

## Data / Schema Change

- [ ] All items from Feature Change checklist.
- [ ] New migration file created in `supabase/migrations/` with timestamp prefix.
- [ ] RLS policies defined for any new tables.
- [ ] RLS policies reviewed: candidates cannot access other candidates' data; staff-only tables reject non-staff.
- [ ] Migration tested locally: `supabase db reset` runs cleanly.
- [ ] Shared Zod schemas in `packages/shared/src/domain.ts` updated if domain types changed.
- [ ] Shared package rebuilt: `npm run build -w @zenith/shared`.

## UI Change (Mobile)

- [ ] All items from Feature Change checklist.
- [ ] Tested on web (`npm run dev:mobile`, open in browser).
- [ ] Tested on iOS simulator or device (if available).
- [ ] Tested on Android emulator or device (if available).
- [ ] Role-based access verified (candidate sees candidate UI, staff sees staff UI).
- [ ] Error states handled (network failure, auth expiry, empty data).
- [ ] Loading states shown during async operations.

## UI Change (Admin)

- [ ] All items from Feature Change checklist.
- [ ] Tested in browser (`npm run dev:admin`).
- [ ] Staff auth guard verified (non-staff users redirected).
- [ ] Responsive layout checked at common breakpoints.
- [ ] `npm run build -w @zenith/admin` succeeds.

## Release Readiness

> See `docs/release.md` for full environment strategy.

- [ ] `npm run verify` passes (lint + typecheck + test).
- [ ] All edge functions deployed to target environment.
- [ ] Database migrations applied to target Supabase project.
- [ ] Mobile smoke test on iOS and Android.
- [ ] Chat send/receive tested.
- [ ] Appointment create/update and staff review tested.
- [ ] Staff status updates reflected in candidate dashboard.
- [ ] No console errors or unhandled promise rejections.
- [ ] Environment-specific secrets configured (not committed).
