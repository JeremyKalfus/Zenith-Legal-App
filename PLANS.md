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
- [x] Test coverage expansion (13 active test files across admin/mobile/shared/supabase)
- [x] Stream messaging on web (stream-chat-react, CDN CSS, `chat_auth_bootstrap` secrets; no users_profile fallback)
- [x] Practice areas multi-select (0–3; `practice_areas` column, shared schema and edge functions updated)
- [x] Staff mobile messaging (shared candidate channels, staff inbox-first navigation, web + native)
- [x] Candidate/staff self-service in-app account deletion flow (Profile screen + `delete_my_account` edge function, with last-staff safeguard)
- [x] Push notification dispatch queue processor (Expo Push API send + queued delivery status updates)
- [x] Staff-created appointment scheduling for candidate accounts (mobile + admin)
- [x] Appointment reminder queue timing support (`notification_deliveries.send_after_utc`, 15-minute push reminders)
- [x] Calendar sync baseline (Apple ICS link sync records per appointment/provider/user)
- [x] Sectioned appointment lifecycle UX across candidate mobile + staff mobile + admin web (`overdue`, `incoming/outgoing`, `upcoming` with ignore/cancel/modify actions and sync)
- [x] Appointment format overhaul across candidate/staff/admin (Date+Time start-only input, note-first cards with inline expansion, standardized field-based chat templates, and hard-delete upcoming cancellations)
- [x] Appointment chat intro alignment across all triggers (candidate submit pending, admin accept incoming, admin direct schedule, admin/candidate cancel, admin decline, admin modify)
- [x] Admin web staff messaging inbox + account deletion workflow (candidate delete + staff delete with self/last-staff safeguards)
- [x] Candidate dashboard authorization UX semantics (waiting decline deletes assignment; authorized decline labeled cancel)
- [x] Code quality pass: duplicate consolidation, theme centralization, hook extraction, edge function refactoring (desloppify strict 85.7 → 86.2)
- [x] Semantic firm-status badge palette across candidate/staff/admin listing surfaces
- [x] Staff candidate JD-year filtering in admin + mobile candidate lists (`search AND (city OR practice OR JD year)`)
- [x] Staff appointment review scheduling posts candidate-channel chat updates (fail-open on chat notification errors)
- [x] Admin candidate manager role promotion flow (`candidate -> staff`) via audited `staff_update_user_role` edge function
- [x] Staff mobile per-candidate banner contact override controls (save + reset to global default)
- [x] Recruiter mobile candidate ownership + Filter Search flow (`candidate_recruiter_assignments`, Assigned Recruiter editor, separate filter screen with Clear/Apply)
- [x] Recruiter job-opportunity push consent + bulk notification workflow in repo (candidate opt-in persistence, explicit native prompt gating, staff Filter Search consent filter, manual recruiter push send, backend queue revalidation)
- [ ] Hosted Supabase deployment parity for recruiter bulk-send (`staff_send_job_opportunity_notification` is local/configured but not active in linked project function list as of 2026-03-06)
- [x] Staff messages auth hardening on admin/mobile bootstrap paths (`ensureValidSession()` before staff chat bootstrap)
- [x] Stream channel readiness gating on candidate/staff thread screens (`channel.watch()` required before render)
- [x] Candidate profile/intake payload hardening (explicit required consent booleans + field-level validation error surfacing)
- [x] Mobile icon/logo mark scaled +14% across app icon assets (`icon`, `adaptive-icon`, `splash-icon`, `favicon`)
- [x] Candidate signup/profile JD year contract + wheel UX (`2000..current year - 1`) with DB date compatibility mapping (`YYYY` ↔ `YYYY-01-01`)
- [x] Candidate dashboard status-update CTA removal + deletion of automated message draft plumbing in candidate messaging navigation/screens
- [ ] Vendor credential wiring for end-to-end runtime (requires secrets)
- [x] Device-level mobile release signing baseline (Apple App ID/App Store Connect app created; Expo EAS project linked; Android keystore + iOS dist cert/provisioning profile created)
- [ ] Android `eas submit` / Play Console integration credential (Google Play service account)
- [x] iOS APNs key + App Store Connect API key configured in EAS
- [x] First store-distribution build artifacts generated successfully (IPA + AAB via EAS production builds)
- [x] App Store privacy-purpose rejection root cause addressed locally by removing unused camera/photo-library native modules from the mobile build inputs
- [ ] EAS production runtime env vars configured and validated in TestFlight/Play builds (current iOS build uses placeholder Supabase config)

## Prioritized Work Queue

### High Priority

1. **Deploy missing hosted edge function for recruiter push send** -- `staff_send_job_opportunity_notification` is implemented locally and referenced by mobile recruiter UI, but not yet active in the linked hosted Supabase function inventory.
2. **Notification dispatch implementation (email provider + processor automation)** -- Push queue processing and delayed reminder support are implemented; email delivery provider integration and production scheduler automation still need completion.
3. **Calendar sync hardening** -- Apple sync wiring is implemented; production credential rollout and Apple pathway confirmation (ICS vs CalDAV) still need completion.

### Medium Priority

4. **Observability wiring** -- Sentry DSN and PostHog key integration points are defined but not connected.
5. **Admin README** -- Replace default Next.js boilerplate README with project-specific documentation.
6. **Store submission configuration + metadata** -- Finish Android submit setup (Google Play service account), run iOS releases via `release:ios` (EAS auto-submit default), and complete App Store Connect / Play Console metadata/compliance forms.

## Blockers and Dependencies

- **Vendor secrets required** for: notification dispatch email provider (push via Expo Push API does not require a provider secret), Apple calendar provider credentials (if Apple path evolves beyond current ICS mode), Sentry, PostHog. Stream Chat (`STREAM_API_KEY`, `STREAM_API_SECRET`) are set in Supabase edge function secrets for messaging.
- **Google Play service account required** for: automated Android `eas submit` uploads. (iOS APNs + App Store Connect API key are configured.)
- **Supabase function deployment parity required** for recruiter push campaigns: deploy `staff_send_job_opportunity_notification` to linked hosted project `njxgoypivrxyrukpouxb`.
- **Staging Supabase project** needed before promoting beyond dev.

## Mobile Release Prep Snapshot (2026-03-03)

- Apple Developer App ID created: `com.zenithlegal.app` (Push Notifications enabled).
- App Store Connect app created: `Zenith Legal` (bundle ID `com.zenithlegal.app`, SKU `zenith-legal-ios-prod`).
- Expo EAS project linked: `@jeremykalfus/zenith-legal-mobile` (project ID `38f93994-daaa-4c85-a092-a70ac12f0c06`).
- EAS config updates applied: remote app version source, production auto-increment retained, push setup prompt disabled after deferral.
- EAS submit config update applied: `submit.production.ios.ascAppId = "6759677619"` to bypass App Store Connect app auto-lookup in `eas submit`.
- iOS release workflow scripts added in `apps/mobile/package.json`:
  - `release:ios` (build + auto-submit)
  - `release:ios:status` (latest build + link to EAS submissions page)
  - `release:ios:submit-latest` (manual submit fallback)
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
- 2026-03-03 local release run:
  - iOS production build `df944362-c6d6-4f92-826d-12126e8253e2` finished for commit `8ea2e6deb4a6086ca1fef913d7c17c487a5a687c`
  - IPA artifact URL: `https://expo.dev/artifacts/eas/tBi2294fFb2jrRuJLK8Ceq.ipa`
  - Local IPA download: `/Users/jeremykalfus/CodingProjects/Zenith Legal App/artifacts/zenith-legal-ios-df944362-c6d6-4f92-826d-12126e8253e2.ipa`
- 2026-03-03 active run:
  - iOS production build `72d675a2-6ca6-49c8-b10e-473de6c0012c` finished in EAS (`1.0.0 (11)`)
  - iOS submission `d140f9be-d8a4-482e-8839-a964b55c928e` scheduled successfully to App Store Connect/TestFlight
- 2026-03-07 App Store review compliance fix:
  - Removed unused Expo media dependencies that were auto-injecting generic iOS camera/photo-library purpose strings
  - `npx expo config --type introspect` no longer reports `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, or `NSPhotoLibraryAddUsageDescription`
- Remaining release operations before store submissions:
  - Configure EAS production mobile runtime env vars and rebuild iOS (and later Android) for real sign-in / backend connectivity
  - Submit a fresh iOS build to App Store Connect so review sees the updated native permission footprint
  - Configure Google Play service account for `eas submit` (or use manual Android upload)
  - Complete store metadata/compliance forms in App Store Connect and Play Console

## Next 6 Tasks

### 1. Deploy hosted recruiter push-send function parity

**Scope:** Deploy `staff_send_job_opportunity_notification` to linked hosted Supabase, verify invocation succeeds from staff mobile `Filter Search`, and confirm queue inserts + audit events are created in hosted DB.

**Verification:**
- `supabase functions list` includes `staff_send_job_opportunity_notification`.
- Staff mobile composer returns queued/skipped summary instead of function-not-found errors.
- Hosted `notification_deliveries` rows are created with `event_type = 'job_opportunity.match'`.
- Hosted `audit_events.action = 'staff_send_job_opportunity_notification'` rows are present.

### 2. Finish notification dispatch (email provider + processor automation)

**Scope:** Complete notification dispatch by adding email delivery provider integration and wiring a scheduler/automation to invoke `dispatch_notifications` in processor mode regularly. Push queue processing via Expo Push API is implemented.

**Verification:**
- Push notifications delivered to candidate devices.
- Email notifications sent for appointment events.
- `notification_deliveries.status` updated to `'sent'` or `'failed'`.
- Processor invocation is automated on a schedule (not manual-only).

### 3. Harden calendar sync rollout

**Scope:** Complete production credential rollout and provider-path hardening for the implemented calendar sync foundation (`connect_calendar_provider`, per-user event links, Apple ICS-link path).

**Verification:**
- Calendar connection persists provider tokens/connection data.
- Scheduled appointments appear in connected calendars for candidate + staff participants.
- `npm run verify` passes.

### 4. Observability wiring

**Scope:** Connect Sentry DSN and PostHog key integration points in mobile/admin so errors and key product events are captured in production environments.

**Verification:**
- Runtime errors are sent to Sentry in staging/production.
- Core onboarding/appointment/messaging events are tracked in PostHog.
- `npm run verify` passes.

### 5. Configure EAS production env vars + rebuild mobile store builds

**Scope:** Add production EAS `EXPO_PUBLIC_*` variables (Supabase URL/anon key, Stream API key, and support contact values), rebuild iOS for TestFlight (and Android when ready), and verify sign-in works against the real backend.

**Verification:**
- EAS `production` environment contains real values for `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_STREAM_API_KEY`.
- New TestFlight build installs and signs in successfully (no placeholder Supabase config error).
- Android store build generated with the same production runtime config values.

### 6. Complete store submission + push credential setup

**Scope:** Finish the remaining mobile release operational work after signing/build baseline setup: configure Android `eas submit` credentials (or document a manual Android upload path), monitor iOS TestFlight processing, and complete App Store Connect / Play Console metadata/compliance configuration.

**Verification:**
- `eas submit -p ios --profile production` uploads to App Store Connect (or IPA manually uploaded and visible in TestFlight processing).
- `eas submit -p android --profile production` uploads to Play Internal Testing (or AAB manually uploaded successfully).
- Standalone/TestFlight iOS push notifications tested after APNs key setup (now configured).
- Store metadata/compliance forms complete in both store consoles.
