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
- [ ] `python3 -m desloppify scan --path .` run to check for regressions (optional but recommended).

## Backend / Edge Function Change

- [ ] All items from Feature Change checklist.
- [ ] Edge function uses `getCurrentUserId()` or `assertStaff()` for auth (not raw `getUser()`).
- [ ] Error responses use `errorResponse(message, status)` from `_shared/http.ts` so clients can read `{ error: "..." }` via `getFunctionErrorMessage()`.
- [ ] HTTP status codes: 401 auth, 403 forbidden, 404 not found, 400/422 validation, 500 server error.
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
- [ ] Mobile production identifiers finalized and consistent across code + stores (`ios.bundleIdentifier`, `android.package`, App Store Connect app, Play Console app).
- [ ] Expo EAS project linked (`owner` + `extra.eas.projectId`) and `apps/mobile/eas.json` build profiles/versioning reviewed.
- [ ] Android signing keystore exists in EAS credentials for the production package.
- [ ] iOS Distribution Certificate + Provisioning Profile exist in EAS credentials for the production bundle ID.
- [ ] iOS APNs key configured in EAS credentials if standalone/TestFlight push notifications are required.
- [ ] Store submission path decided/tested: EAS submit credentials configured (App Store Connect API key, Google Play service account) or manual upload procedure documented.
- [ ] EAS production mobile runtime vars configured (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_STREAM_API_KEY`) and verified in a store build.
- [ ] App Store Connect export compliance + app privacy questionnaires completed and consistent with runtime behavior.
- [ ] Google Play Data safety / content rating / app content declarations completed and consistent with runtime behavior.
- [ ] All edge functions deployed to target environment.
- [ ] Database migrations applied to target Supabase project.
- [ ] Mobile smoke test on iOS and Android.
- [ ] Chat send/receive tested (web: Messages tab with stream-chat-react; native: Stream Chat SDK).
- [ ] Appointment create/update and staff review tested.
- [ ] Staff status updates reflected in candidate dashboard.
- [ ] No console errors or unhandled promise rejections.
- [ ] Environment-specific secrets configured (not committed).

### Release Snapshot (2026-02-25)

- [x] Production app identifiers set to `com.zenithlegal.app` in `apps/mobile/app.json`.
- [x] Apple Developer App ID created (`com.zenithlegal.app`) with Push Notifications enabled.
- [x] App Store Connect app record created (`Zenith Legal`, bundle ID `com.zenithlegal.app`).
- [x] Expo EAS project linked (`@jeremykalfus/zenith-legal-mobile`, project ID `38f93994-daaa-4c85-a092-a70ac12f0c06`).
- [x] Android EAS keystore created for production signing.
- [x] iOS EAS Distribution Certificate + Provisioning Profile created for production signing.
- [x] iOS APNs key configured in EAS credentials.
- [x] App Store Connect API key configured for `eas submit`.
- [ ] Google Play service account configured for `eas submit`.
- [x] EAS production build artifacts generated (iOS IPA + Android AAB).
- [x] iOS EAS submission scheduled to App Store Connect/TestFlight.
- [x] Manual Transporter upload fallback used successfully after EAS submit scheduling did not surface a build in App Store Connect.
- [x] App Store Connect/TestFlight shows iOS build `1.0.0 (2)` processed.
- [ ] TestFlight runtime sign-in validated (current `1.0.0 (2)` build fails with placeholder Supabase config due missing EAS production env vars).
- [ ] App Store Connect / Play Console metadata and compliance forms completed.

## Code Quality (desloppify)

Run desloppify to scan the codebase for technical debt, duplications, and code smells.

### Installation

```bash
python3 -m pip install --break-system-packages "desloppify[full]"
```

### Scan Workflow

```bash
# Full scan
python3 -m desloppify scan --path .

# View top priorities
python3 -m desloppify next --count 10

# View a specific finding
python3 -m desloppify show <finding-id>

# Generate a prioritized fix plan
python3 -m desloppify plan

# After fixing an issue, mark it resolved
python3 -m desloppify resolve fixed "<finding-id>"

# If intentional / acceptable, mark as wontfix
python3 -m desloppify resolve wontfix "<finding-id>" --note "reason"

# Rescan to verify
python3 -m desloppify scan --path .
```

### Auto-fixers (TypeScript)

```bash
# Dry-run first
python3 -m desloppify fix unused-imports --dry-run
python3 -m desloppify fix unused-vars --dry-run
python3 -m desloppify fix debug-logs --dry-run
python3 -m desloppify fix dead-exports --dry-run

# Apply
python3 -m desloppify fix unused-imports
```

### Subjective Review (biggest score lever)

```bash
# Prepare and run blind subjective review batches
python3 -m desloppify review --run-batches --runner codex --parallel --scan-after-import
```

### Score Tracking (as of 2026-02-26)

- Overall: 91.5/100 (lenient), 86.2/100 (strict)
- Open findings: 213
- Key dimensions: File health 100%, Code quality 97.9%, Duplication 86.7%, Test health 23%, Security 100%
