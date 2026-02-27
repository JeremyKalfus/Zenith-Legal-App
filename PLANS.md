# Execution Plans

## Current Milestone Status

- [x] Monorepo scaffolding and CI baseline
- [x] Shared domain contracts and validation schemas
- [x] Supabase initial schema + RLS + edge function contracts
- [x] Mobile role-based navigation skeleton and core screens
- [x] Admin operations dashboard skeleton
- [x] Edge function auth fix (getUser with explicit JWT + verify_jwt=false)
- [x] Appointment creation and viewing for candidates
- [x] Staff appointment review workflow (pending/scheduled/declined, edge function, mobile + admin UI)
- [x] Admin appointment management (accept/decline in dashboard)
- [x] Error handling standardization (shared `getFunctionErrorMessage` utility; response-body extraction via `error.context` / `Response.clone()`)
- [x] Test coverage expansion (41 tests across 6 files)
- [x] Stream messaging on web (stream-chat-react, CDN CSS, `chat_auth_bootstrap` secrets; no users_profile fallback)
- [x] Practice areas multi-select (0–3; `practice_areas` column, shared schema and edge functions updated)
- [x] Staff mobile messaging (shared candidate channels, staff inbox-first navigation, web + native)
- [x] Admin web staff messaging inbox + candidate deletion workflow (candidate-only hard delete)
- [x] Candidate dashboard authorization UX semantics (waiting decline deletes assignment; authorized decline labeled cancel)
- [x] Candidate self-service in-app account deletion flow (Profile screen + `delete_my_account` edge function)
- [x] Push notification dispatch queue processor (Expo Push API send + queued delivery status updates)
- [x] Staff-created appointment scheduling for candidate accounts (mobile + admin)
- [x] Appointment reminder queue timing support (`notification_deliveries.send_after_utc`, 15-minute push reminders)
- [x] Calendar sync baseline (Google API sync + Apple ICS link sync records per appointment/provider/user)
- [x] Appointment retention UX rule (scheduled/declined hidden from candidate/staff views 24h after end)
- [x] Admin web staff messaging inbox + candidate deletion workflow (candidate-only hard delete)
- [x] Candidate dashboard authorization UX semantics (waiting decline deletes assignment; authorized decline labeled cancel)
- [x] Code quality pass: duplicate consolidation, theme centralization, hook extraction, edge function refactoring (desloppify strict 85.7 → 86.2)
- [x] Semantic firm-status badge palette across candidate/staff/admin listing surfaces
- [x] Staff mobile per-candidate banner contact override controls (save + reset to global default)
- [x] Mobile icon/logo mark scaled +14% across app icon assets (`icon`, `adaptive-icon`, `splash-icon`, `favicon`)
- [ ] Vendor credential wiring for end-to-end runtime (requires secrets)
- [x] Device-level mobile release signing baseline (Apple App ID/App Store Connect app created; Expo EAS project linked; Android keystore + iOS dist cert/provisioning profile created)
- [ ] Android `eas submit` / Play Console integration credential (Google Play service account)
- [x] iOS APNs key + App Store Connect API key configured in EAS
- [x] First store-distribution build artifacts generated successfully (IPA + AAB via EAS production builds)
- [ ] EAS production runtime env vars configured and validated in TestFlight/Play builds (current iOS build uses placeholder Supabase config)

## Prioritized Work Queue

### High Priority

1. **Notification dispatch implementation (email provider + processor automation)** -- Push queue processing and delayed reminder support are implemented; email delivery provider integration and production scheduler automation still need completion.
2. **Calendar sync hardening** -- Google/Apple sync wiring is implemented; production OAuth credential rollout and Apple pathway confirmation (ICS vs CalDAV) still need completion.

### Medium Priority

3. **Observability wiring** -- Sentry DSN and PostHog key integration points are defined but not connected.
4. **Admin README** -- Replace default Next.js boilerplate README with project-specific documentation.
5. **Store submission configuration + metadata** -- Finish Android submit setup (Google Play service account), document manual Transporter fallback for iOS uploads, and complete App Store Connect / Play Console metadata/compliance forms.

## Blockers and Dependencies

- **Vendor secrets required** for: notification dispatch email provider (push via Expo Push API does not require a provider secret), calendar OAuth (Google/Apple credentials depending final Apple path), Sentry, PostHog. Stream Chat (`STREAM_API_KEY`, `STREAM_API_SECRET`) are set in Supabase edge function secrets for messaging.
- **Google Play service account required** for: automated Android `eas submit` uploads. (iOS APNs + App Store Connect API key are configured.)
- **Staging Supabase project** needed before promoting beyond dev.

## Mobile Release Prep Snapshot (2026-02-25)

- Apple Developer App ID created: `com.zenithlegal.app` (Push Notifications enabled).
- App Store Connect app created: `Zenith Legal` (bundle ID `com.zenithlegal.app`, SKU `zenith-legal-ios-prod`).
- Expo EAS project linked: `@jeremykalfus/zenith-legal-mobile` (project ID `38f93994-daaa-4c85-a092-a70ac12f0c06`).
- EAS config updates applied: remote app version source, production auto-increment retained, push setup prompt disabled after deferral.
- EAS submit config update applied: `submit.production.ios.ascAppId = "6759677619"` to bypass App Store Connect app auto-lookup in `eas submit`.
- EAS credentials created:
  - Android production keystore (package `com.zenithlegal.app`)
  - iOS Distribution Certificate + Provisioning Profile (bundle ID `com.zenithlegal.app`)
  - iOS Apple Push Notifications key (assigned to `com.zenithlegal.app`)
  - iOS App Store Connect API key for EAS Submit
- Production builds initiated:
  - iOS build `36ca22cc-f921-431c-a24b-5adfd6d7871c` (finished, IPA generated)
  - Android build `3c84ffe0-aa34-444e-8f52-cc43bef37bd4` (finished, AAB generated)
- iOS submission initiated:
  - EAS submission `25b4cdb9-7d8a-4b4a-af49-8dcf53994ff0` scheduled to App Store Connect after `ascAppId` workaround
- Manual iOS upload fallback:
  - Transporter upload delivered IPA to App Store Connect successfully (build upload `1.0.0 (2)` now processed in TestFlight)
- Runtime validation finding:
  - TestFlight sign-in fails with `Supabase config is still using placeholder values.` because EAS production `EXPO_PUBLIC_*` vars were not configured before the build
- Remaining release operations before store submissions:
  - Configure EAS production mobile runtime env vars and rebuild iOS (and later Android) for real sign-in / backend connectivity
  - Configure Google Play service account for `eas submit` (or use manual Android upload)
  - Complete store metadata/compliance forms in App Store Connect and Play Console

## Next 6 Tasks

### 1. Finish notification dispatch (email provider + processor automation)

**Scope:** Complete notification dispatch by adding email delivery provider integration and wiring a scheduler/automation to invoke `dispatch_notifications` in processor mode regularly. Push queue processing via Expo Push API is implemented.

**Verification:**
- Push notifications delivered to candidate devices.
- Email notifications sent for appointment events.
- `notification_deliveries.status` updated to `'sent'` or `'failed'`.
- Processor invocation is automated on a schedule (not manual-only).

### 2. Harden calendar sync rollout

**Scope:** Complete production credential rollout and provider-path hardening for the implemented calendar sync foundation (`connect_calendar_provider`, per-user event links, Google API sync, Apple ICS-link path).

**Verification:**
- Calendar connection persists provider tokens/connection data.
- Scheduled appointments appear in connected calendars for candidate + staff participants.
- `npm run verify` passes.

### 3. Observability wiring

**Scope:** Connect Sentry DSN and PostHog key integration points in mobile/admin so errors and key product events are captured in production environments.

**Verification:**
- Runtime errors are sent to Sentry in staging/production.
- Core onboarding/appointment/messaging events are tracked in PostHog.
- `npm run verify` passes.

### 4. Configure EAS production env vars + rebuild mobile store builds

**Scope:** Add production EAS `EXPO_PUBLIC_*` variables (Supabase URL/anon key, Stream API key, and support contact values), rebuild iOS for TestFlight (and Android when ready), and verify sign-in works against the real backend.

**Verification:**
- EAS `production` environment contains real values for `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_STREAM_API_KEY`.
- New TestFlight build installs and signs in successfully (no placeholder Supabase config error).
- Android store build generated with the same production runtime config values.

### 5. Complete store submission + push credential setup

**Scope:** Finish the remaining mobile release operational work after signing/build baseline setup: configure Android `eas submit` credentials (or document a manual Android upload path), monitor iOS TestFlight processing, and complete App Store Connect / Play Console metadata/compliance configuration.

**Verification:**
- `eas submit -p ios --profile production` uploads to App Store Connect (or IPA manually uploaded and visible in TestFlight processing).
- `eas submit -p android --profile production` uploads to Play Internal Testing (or AAB manually uploaded successfully).
- Standalone/TestFlight iOS push notifications tested after APNs key setup (now configured).
- Store metadata/compliance forms complete in both store consoles.

### 6. Improve test health for candidate operations flows

**Scope:** Increase automated coverage in admin/mobile candidate operations paths (assignment status updates, staff banner override save/reset behavior, and candidate banner resolution precedence) to improve the current low test-health dimension.

**Verification:**
- Candidate operations regressions are covered by unit/integration tests.
- Test health score improves without increasing wontfix debt.
- `npm run verify` passes.
