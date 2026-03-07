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
- [ ] Local-vs-hosted function parity checked (`supabase functions list` includes the new/updated function slug in the linked project).
- [ ] Audit events written for privileged operations via `writeAuditEvent()`.

## Data / Schema Change

- [ ] All items from Feature Change checklist.
- [ ] New migration file created in `supabase/migrations/` with timestamp prefix.
- [ ] `supabase migration list` confirms local/hosted migration parity after applying.
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
- [ ] iOS release command path validated from repo scripts (`npm run release:ios -w @zenith/mobile`, `npm run release:ios:status -w @zenith/mobile`).
- [ ] EAS production mobile runtime vars configured (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_STREAM_API_KEY`) and verified in a store build (`EAS_BUILD_PROFILE=production npx expo config --type public` resolves without placeholder values).
- [ ] iOS `Info.plist` permission entries match currently shipped features only; verify with `npx expo config --type introspect` before each submission and keep remaining purpose strings app-specific and example-based.
- [ ] App Store Connect export compliance + app privacy questionnaires completed and consistent with runtime behavior.
- [ ] App Store Connect review notes updated from `APP_REVIEW_NOTES.md` with current candidate/staff credentials and permission explanations.
- [ ] Google Play Data safety / content rating / app content declarations completed and consistent with runtime behavior.
- [ ] All edge functions deployed to target environment.
- [ ] Local-vs-hosted function inventory parity checked (no missing deployed slugs).
- [ ] Database migrations applied to target Supabase project.
- [ ] Mobile smoke test on iOS and Android.
- [ ] Chat send/receive tested (web: Messages tab with stream-chat-react; native: Stream Chat SDK).
- [ ] Appointment create/update and staff review tested.
- [ ] Staff status updates reflected in candidate dashboard.
- [ ] No console errors or unhandled promise rejections.
- [ ] Environment-specific secrets configured (not committed).

### Release Snapshot (2026-03-03)

- [x] Production app identifiers set to `com.zenithlegal.app` in `apps/mobile/app.config.js`.
- [x] Apple Developer App ID created (`com.zenithlegal.app`) with Push Notifications enabled.
- [x] App Store Connect app record created (`Zenith Legal`, bundle ID `com.zenithlegal.app`).
- [x] Expo EAS project linked (`@jeremykalfus/zenith-legal-mobile`, project ID `38f93994-daaa-4c85-a092-a70ac12f0c06`).
- [x] Android EAS keystore created for production signing.
- [x] iOS EAS Distribution Certificate + Provisioning Profile created for production signing.
- [x] iOS APNs key configured in EAS credentials.
- [x] App Store Connect API key configured for `eas submit`.
- [x] iOS default release scripts added in `apps/mobile/package.json` (`release:ios`, `release:ios:status`, `release:ios:submit-latest`).
- [ ] Google Play service account configured for `eas submit`.
- [x] EAS production build artifacts generated (iOS IPA + Android AAB).
- [x] iOS EAS submission scheduled to App Store Connect/TestFlight.
- [x] Manual Transporter upload fallback used successfully after EAS submit scheduling did not surface a build in App Store Connect.
- [x] Default iOS release path switched to EAS build + auto-submit; Transporter retained as contingency only.
- [x] App Store Connect/TestFlight shows iOS build `1.0.0 (2)` processed.
- [x] 2026-03-03 iOS production build `df944362-c6d6-4f92-826d-12126e8253e2` finished from commit `8ea2e6deb4a6086ca1fef913d7c17c487a5a687c` and IPA downloaded locally.
- [x] 2026-03-03 iOS production build `72d675a2-6ca6-49c8-b10e-473de6c0012c` (`1.0.0 (11)`) finished and submitted via EAS (`d140f9be-d8a4-482e-8839-a964b55c928e`).
- [ ] TestFlight runtime sign-in validated (current `1.0.0 (2)` build fails with placeholder Supabase config due missing EAS production env vars).
- [ ] App Store Connect / Play Console metadata and compliance forms completed.
- [x] 2026-03-07 Expo config hardening moved native config to `apps/mobile/app.config.js`, disabled unused reminders/Face ID generation, and confirmed `npx expo config --type introspect` now resolves only the shipped calendar permission on iOS.

### Supabase Backend Parity Snapshot (2026-03-06)

- [x] Linked hosted project: `njxgoypivrxyrukpouxb` (`ZL App`, West US/Oregon).
- [x] Local/hosted migration parity confirmed through `20260306130500` (`supabase migration list`).
- [x] `supabase/config.toml` contains `verify_jwt = false` block for `staff_send_job_opportunity_notification`.
- [ ] Hosted function parity complete (`staff_send_job_opportunity_notification` is present locally but missing from `supabase functions list` as of 2026-03-06).

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

### Score Tracking (as of 2026-03-06)

- Overall: 67.7/100 (lenient), 61.3/100 (strict)
- Objective score: 94.0/100
- Open findings (in-scope): 284
- Key dimensions: File health 97.3%, Code quality 98.2%, Duplication 92.8%, Test health 82.1% (strict 10.6%), Security 98.8%
