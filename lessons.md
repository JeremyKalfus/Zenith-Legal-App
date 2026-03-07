# Lessons Log

## Function

This file is where the agent records lessons learned and concrete errors made while working in this repository.

## Purpose

This log exists to make future work self-improving by preventing repeated mistakes and capturing repeatable corrective patterns.

## Usage Rule

Append a new entry immediately after incidents and after post-fix verification is complete.

## Entry Template

- **Date:**
- **Context:**
- **Error:**
- **Why it happened:**
- **Fix applied:**
- **Prevention rule:**
- **Follow-up checks:**

## Entries

### 2026-02-27 — Supabase CLI Auth/Link Awareness

- **Date:** 2026-02-27
- **Context:** Applying database migrations for the linked Zenith Legal Supabase project.
- **Error:** Asked for credentials before checking whether Supabase CLI was already authenticated and project-linked.
- **Why it happened:** Skipped the direct verification step (`supabase projects list` / linked project ref check) before asking for keys.
- **Fix applied:** Verified CLI auth/link first, then ran `supabase db push` directly without requesting passwords or keys.
- **Prevention rule:** Always check Supabase CLI auth/link status before asking for credentials. If authenticated and linked, run migrations/deploys directly.
- **Follow-up checks:** Confirm migration applied with `supabase migration list` and validate table/query availability from app environment.

### 2026-02-27 — Desloppify Render Crash on String `detail`

- **Date:** 2026-02-27
- **Context:** Running `desloppify next --count 10` and `desloppify show responsibility_cohesion --status open --top 50` during quality triage.
- **Error:** `desloppify` crashed with `AttributeError: 'str' object has no attribute 'get'` in `app/commands/next_parts/render.py` and `app/commands/show/formatting.py`.
- **Why it happened:** A finding carried `detail` as a string, but renderer code assumed `detail` was always an object and called `.get(...)`.
- **Fix applied:** Worked around the crash by using pattern-based `resolve` commands for the affected detector IDs and continued scanning/resolution flow.
- **Prevention rule:** When `desloppify show` or `next` crashes on a detector payload shape, switch to `resolve`/`show <other-detector>` flow and capture the exact traceback for upstream reporting.
- **Follow-up checks:** Re-ran `desloppify scan --path .` and `desloppify status` to confirm open findings reached zero despite renderer failure.

### 2026-02-28 — Profile Column Drift Broke Auth/Profile Surfaces

- **Date:** 2026-02-28
- **Context:** Candidate signup/profile and admin chat/candidate views showed runtime errors after profile updates.
- **Error:** Multiple surfaces still queried or mapped `users_profile.profile_picture_url`, causing failures when that column was absent or intentionally removed from active usage.
- **Why it happened:** UI/backend references to profile photo were spread across mobile, admin, edge functions, and shared types; not all call sites were updated together.
- **Fix applied:** Removed profile-photo feature end-to-end (mobile UI, admin UI, shared types, edge function payloads/selects, migration/storage dependency) and kept JD degree date support intact.
- **Prevention rule:** When deprecating a profile field, run a repo-wide symbol audit first (`rg` across apps/packages/supabase/docs) and complete all consumer removals before shipping.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, `npm run test` all passed after the sweep.

### 2026-02-28 — Remote Migration Drift Caused JD Filter Query Failures

- **Date:** 2026-02-28
- **Context:** Staff candidate filtering/loading paths in admin and mobile surfaced `column users_profile.jd_degree_date does not exist`.
- **Error:** App queries expected `users_profile.jd_degree_date`, but the linked remote project had not applied migration `20260228161000_candidate_jd_degree_date.sql`.
- **Why it happened:** Local code and migrations advanced ahead of remote schema state; deployment parity was not confirmed before using the new column in list/select paths.
- **Fix applied:** Ran `supabase db push`, confirmed migration parity via `supabase migration list`, and verified generated linked DB types include `users_profile.jd_degree_date`.
- **Prevention rule:** Before enabling new column usage in UI/edge queries, verify remote migration parity on the linked project (`supabase migration list`) and apply pending migrations first.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after migration + filter updates.

### 2026-02-28 — Raw Edge Invoke Errors Hid Actionable Appointment Review Failures

- **Date:** 2026-02-28
- **Context:** Recruiter appointment review scheduling showed generic `Edge Function returns a non-2xx status code` instead of backend error payload details.
- **Error:** Review handlers surfaced `error.message` directly and admin error parsing did not robustly parse `FunctionsHttpError.context` response bodies.
- **Why it happened:** Not all invoke call sites used shared error extraction helpers, and parser behavior diverged between admin and mobile implementations.
- **Fix applied:** Standardized admin error parser with response clone/body parsing and updated admin/mobile appointment-review invoke handlers to use `getFunctionErrorMessage`.
- **Prevention rule:** Any user-facing edge-function invoke path must use `getFunctionErrorMessage` and avoid displaying raw `FunctionsHttpError.message`.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after parser + handler updates.

### 2026-02-28 — Unhandled Recruiter Contact Fetch Rejection Surfaced Network Toast

- **Date:** 2026-02-28
- **Context:** Auth/login screen showed `TypeError: Network request failed` while mounting recruiter contact banner data.
- **Error:** `RecruiterContactProvider.refresh()` executed Supabase reads without `try/catch`, allowing network failures to escape as unhandled promise rejections.
- **Why it happened:** Banner contact fetch assumed successful connectivity and did not guard transient fetch failures or invalid Supabase config state.
- **Fix applied:** Wrapped `refresh()` Supabase calls in `try/catch`, added early config guard via `getSupabaseClientConfigError()`, and fallback to default recruiter contact on failure.
- **Prevention rule:** Provider-level startup/background fetches must always catch and degrade gracefully; never allow data-refresh promises in `useEffect` to reject uncaught.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the fix.

### 2026-02-28 — Mobile Password Sign-In Needed RN-Safe Fallback Path

- **Date:** 2026-02-28
- **Context:** Candidate login surfaced `Cannot reach Supabase right now...` because `supabase.auth.signInWithPassword` threw a native fetch network failure on device.
- **Error:** Password sign-in relied on a single client path and failed hard when the RN transport path raised `Network request failed`.
- **Why it happened:** Auth flow had no fallback for client-specific transport failures, even though direct Supabase Auth REST endpoint remained available.
- **Fix applied:** Added a network-error fallback that retries sign-in via `/auth/v1/token?grant_type=password` and then sets session via `supabase.auth.setSession`.
- **Prevention rule:** Critical auth entry points must include a fallback transport path for recoverable client SDK request failures.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after adding fallback sign-in logic.

### 2026-02-28 — Native SDK Password Path Still Emitted Unhandled Fetch Error

- **Date:** 2026-02-28
- **Context:** Login UI showed handled error text, but device still displayed RN red toast `TypeError: Network request failed`.
- **Error:** Native path still attempted `supabase.auth.signInWithPassword` first, and an internal SDK fetch rejection surfaced as unhandled despite outer try/catch.
- **Why it happened:** Fallback-only strategy kept the unstable primary call on native platforms.
- **Fix applied:** Changed native (`iOS`/`Android`) password login to use direct Auth REST sign-in as the primary path; kept SDK path for web with fallback.
- **Prevention rule:** If a client SDK call is known to emit internal unhandled transport errors on a platform, remove it from the primary runtime path on that platform.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after platform routing update.

### 2026-02-28 — `setSession` Validation Fetch Could Block Native Login

- **Date:** 2026-02-28
- **Context:** Native login still failed with network errors after successful credential-path hardening.
- **Error:** `supabase.auth.setSession` can perform an immediate `/auth/v1/user` validation call; when that network step fails, session bootstrap aborts.
- **Why it happened:** Session establishment depended on network validation even when valid access/refresh tokens were already returned.
- **Fix applied:** Added a guarded local-session fallback: on network-only `setSession` failure, decode JWT payload, persist session via auth internals, and emit `SIGNED_IN`.
- **Prevention rule:** For critical login flows, treat post-token validation fetches as best-effort and keep a controlled local bootstrap fallback.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after fallback session persistence update.

### 2026-02-28 — Dev-Only One-Time Bypass Needed During Auth Outage

- **Date:** 2026-02-28
- **Context:** User needed immediate in-app access while mobile auth/network path remained unstable.
- **Error:** Standard login path could not be relied on for immediate access to the target account.
- **Why it happened:** Upstream network/auth availability prevented normal sign-in completion.
- **Fix applied:** Added a development-only bypass action locked to `jeremykalfus@gmail.com`, one-time per app launch, with local session/profile bootstrap and network hydration skips.
- **Prevention rule:** Emergency bypasses must be dev-only, explicitly scoped to a known account, and easy to remove once auth stability returns.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after adding bypass flow.

### 2026-03-01 — Stream Avatar Fields Must Be Explicitly Cleared

- **Date:** 2026-03-01
- **Context:** Turning off profile pictures for chat users while preserving Zenith Legal branding.
- **Error:** Non-Zenith users could retain old Stream avatars because image fields were omitted (undefined) during upsert.
- **Why it happened:** Stream user updates merged partial fields; omitting `image` did not reliably clear an existing value.
- **Fix applied:** Updated chat bootstrap and shared Stream messaging upserts to send `image: ''` for non-Zenith users (candidate + non-brand staff), and gated UI avatar rendering on a real image URL.
- **Prevention rule:** When deprecating/removing a remote profile field, write an explicit clearing value instead of omitting the field in upsert payloads.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, `npm run test`, and `python3 -m desloppify scan --path .` completed after the change.

### 2026-03-01 — JD Date Sync Needed Profile-Table Realtime Listeners

- **Date:** 2026-03-01
- **Context:** Candidate profile JD degree date updates needed to propagate to staff/admin candidate lists and JD-year filter options.
- **Error:** Candidate list refresh listeners only watched `candidate_firm_assignments` (or were absent), so JD date and preference-based filter data could remain stale until manual reload/poll.
- **Why it happened:** Realtime subscriptions did not include source tables for JD date and chip filters (`users_profile`, `candidate_preferences`).
- **Fix applied:** Added realtime `postgres_changes` listeners in admin candidate manager and mobile staff candidates list for `users_profile` and `candidate_preferences` (plus recruiter assignment table on mobile), triggering list reload via existing guarded loaders.
- **Prevention rule:** Any UI surface deriving filter options from profile/preference fields must subscribe to those source tables, not only assignment/status tables.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the sync listener updates.

### 2026-03-01 — JD Date Picker Was Dropping Valid Non-`set` Events

- **Date:** 2026-03-01
- **Context:** Candidate JD date selection appeared to do nothing and did not persist to profile/admin/filter surfaces.
- **Error:** JD date handlers required `event.type === 'set'`, which can ignore valid selection events on non-native picker implementations.
- **Why it happened:** Date-picker event handling was too strict and tied to one event-type string instead of accepting any non-dismiss event with a valid date payload.
- **Fix applied:** Updated intake/profile JD handlers to reject only `dismissed` events and accept any event carrying `nextDate`, then persist `jdDegreeDate`.
- **Prevention rule:** For cross-platform picker handlers, gate by payload validity (`nextDate`) and explicit dismiss states, not a single success event literal.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the fix.

### 2026-03-03 — Automated Firm-Status Message Shipped with Candidate Typo

- **Date:** 2026-03-03
- **Context:** Staff-triggered firm status update messages in the candidate/recruiter chat stream contained a misspelling (`Canidate`).
- **Error:** User-facing automated copy in `supabase/functions/staff_update_assignment_status/index.ts` used `Canidate` in both status message templates.
- **Why it happened:** Message template text was changed without a targeted typo scan on user-facing automated strings before shipping.
- **Fix applied:** Replaced both `Canidate` instances with `Candidate` and re-scanned known misspelling patterns across `supabase/functions`, `apps`, and `packages`.
- **Prevention rule:** Before pushing edge-function copy changes, run a targeted typo scan on all user-facing automated message templates and verify exact rendered template strings.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the fix.

### 2026-03-03 — Appointments Tab Needed Throw-Safe Supabase Fetch Guards

- **Date:** 2026-03-03
- **Context:** Candidate appointments tab surfaced `TypeError: Network request failed` during background/focus-driven data refresh.
- **Error:** Appointments and calendar-connection fetch paths relied on Supabase query error returns but did not catch thrown transport exceptions, leading to unhandled promise rejections in React Native.
- **Why it happened:** Reload callbacks (`loadAppointments`, `useCalendarSyncEnabled`) were invoked from effects/intervals with `void` and lacked local `try/catch`, so thrown fetch failures bypassed UI error handling.
- **Fix applied:** Added config/session guards (`getSupabaseClientConfigError`, `ensureValidSession`), in-flight gating, and throw-safe `try/catch/finally` handling for candidate/staff appointments loaders and calendar sync enabled lookup.
- **Prevention rule:** Any Supabase fetch used in effect/interval/focus callbacks must handle both returned query errors and thrown transport exceptions locally.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after hardening.

### 2026-03-06 — Staff Deletion Needed Appointment-Creator Reassignment

- **Date:** 2026-03-06
- **Context:** Admin-side staff account deletion needed to work for recruiter users who had previously scheduled candidate appointments.
- **Error:** Deleting a staff auth user would leave `appointments.created_by_user_id` pointing at that user, which breaks the delete path because those rows are still retained for candidates.
- **Why it happened:** The schema keeps appointment history but still stores the creator as a required foreign-key reference, and staff deletion had previously been scoped away from this case.
- **Fix applied:** Expanded `staff_delete_user` to support staff targets, added a last-staff guard, and reassigned deleted-staff appointment creators to the appointment candidate before auth deletion.
- **Prevention rule:** Before broadening account-deletion scope to a new role, audit every non-cascading foreign-key reference for that role and either null, reassign, or cascade it intentionally.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the deletion-flow update.

### 2026-03-06 — Admin-Only Staff Deletion Missed the Actual Staff Profile UX

- **Date:** 2026-03-06
- **Context:** The initial staff-account deletion work added admin deletion controls, but the visible staff profile in the mobile app still had no delete option.
- **Error:** The feature scope was implemented at the admin-management layer only, which did not satisfy the user-facing expectation of “delete my staff account from the staff account screen.”
- **Why it happened:** The original request was interpreted as account-management capability for staff users rather than as a self-service affordance on the staff profile surface.
- **Fix applied:** Extended `delete_my_account` to support staff self-delete with last-staff protection and added the delete-confirmation UI to `apps/mobile/src/screens/staff/staff-profile-screen.tsx`.
- **Prevention rule:** For account-setting requests, verify whether the expected entry point is self-service profile UI, admin management UI, or both before stopping at the first valid implementation.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the profile deletion flow was added.

### 2026-03-06 — Staff Messages Bootstrap Must Refresh Session First

- **Date:** 2026-03-06
- **Context:** Staff users intermittently saw auth errors when opening Messages after the app/web session had been idle or backgrounded.
- **Error:** Some staff chat bootstrap paths invoked `chat_auth_bootstrap` using the stored session from `auth.getSession()` without forcing a near-expiry refresh first.
- **Why it happened:** The code assumed Supabase auto-refresh would always keep access tokens current, but that assumption breaks after backgrounding/suspension and on idle admin tabs.
- **Fix applied:** Added and reused `ensureValidSession()` before staff chat bootstrap in the admin dashboard guard, admin staff messages dashboard, and mobile staff tab indicators.
- **Prevention rule:** Any privileged or user-visible edge-function bootstrap path must explicitly refresh/validate the session before invoking the backend; do not rely only on background auto-refresh timers.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the auth hardening changes.

### 2026-03-06 — Stream Thread Screens Must Watch Channels Before Rendering

- **Date:** 2026-03-06
- **Context:** Opening Messages could show `Error loading messages for this channel` even when chat bootstrap and Stream connection had already succeeded.
- **Error:** Candidate and staff thread screens constructed `client.channel(...)` and rendered the `Channel` component before the channel had been `watch()`ed and fully initialized.
- **Why it happened:** The code assumed a channel ID alone was sufficient for immediate thread rendering, but Stream’s thread UI expects channel state to be loaded first.
- **Fix applied:** Added explicit `channel.watch()` readiness handling in `apps/mobile/src/lib/use-resolved-candidate-chat-channel.ts` and `apps/mobile/src/screens/staff/staff-message-thread-screen.tsx`, with loading/error states before rendering the thread UI.
- **Prevention rule:** Any Stream thread surface must wait for `watch()` (or an equivalent stateful channel query) before rendering `Channel`/`MessageList`.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the thread bootstrap fix.

### 2026-03-06 — Candidate Profile Save Needs Explicit Consent Booleans and Field-Level Validation Errors

- **Date:** 2026-03-06
- **Context:** Editing candidate profile data returned the generic server error `Invalid payload`.
- **Error:** The profile/intake submit paths relied on implicit form state for required consent booleans, while the server only returned `formErrors`, hiding field-level validation failures behind a generic payload error.
- **Why it happened:** Required booleans that were not directly user-edited were treated as “obviously present,” and server validation formatting ignored `fieldErrors`.
- **Fix applied:** Sent `acceptedCommunicationConsent: true` explicitly from the mobile intake/profile submit paths and updated `supabase/functions/create_or_update_candidate_profile/index.ts` to include field-level validation messages in the error response.
- **Prevention rule:** If a backend contract requires hidden/defaulted fields, include them explicitly in submit payloads and surface both form-level and field-level validation errors from edge functions.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, and `npm run test` passed after the payload/error-message fix.

### 2026-03-07 — Unused Expo Native Modules Can Trigger App Review Privacy Rejections

- **Date:** 2026-03-07
- **Context:** Apple rejected the iOS build for insufficient camera/photo-library purpose strings under Guideline 5.1.1(ii).
- **Error:** The mobile app shipped generic `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` entries even though no image capture/upload flow was present in `apps/mobile/src`.
- **Why it happened:** Installed Expo media modules (`expo-image-picker`, `expo-media-library`, and related helpers) were left in `apps/mobile/package.json`, and Expo auto-injected native permission keys during config resolution.
- **Fix applied:** Removed the unused media-related Expo dependencies, regenerated the lockfile, and confirmed via `npx expo config --type introspect` that the next iOS build no longer declares camera/photo-library permissions.
- **Prevention rule:** Before each store submission, inspect the resolved Expo config and verify every protected-resource permission maps to a shipped feature; remove unused native modules instead of only rewriting generic purpose strings.
- **Follow-up checks:** `npm run lint`, `npm run typecheck`, `npm run test`, and `python3 -m desloppify scan --path .`.

### 2026-03-07 — Expo Plugin Defaults Can Reintroduce Review-Sensitive iOS Permissions

- **Date:** 2026-03-07
- **Context:** After camera/photo cleanup, the resolved iOS config still carried reminders, microphone, Face ID, and permissive ATS entries that were not part of the shipped feature set.
- **Error:** Static Expo config left plugin defaults enabled, so `npx expo config --type introspect` continued to emit review-sensitive iOS keys even though the app only needed device-calendar access.
- **Why it happened:** Keeping `app.json` static and relying on plugin defaults made it easy for Expo modules to widen the native permission surface without any active product requirement.
- **Fix applied:** Replaced `apps/mobile/app.json` with `apps/mobile/app.config.js`, disabled `faceIDPermission` and `remindersPermission`, removed unused active plugins, limited ATS exceptions to non-production localhost development, and added production env validation for required `EXPO_PUBLIC_*` values.
- **Prevention rule:** Treat the resolved Expo config as the review artifact of record; before every store build, inspect it and keep plugin config explicit for any protected-resource capability.
- **Follow-up checks:** `npx expo config --type introspect` and `EAS_BUILD_PROFILE=production npx expo config --type public`.

### 2026-03-07 — Clean App Review Surface Requires Post-Plugin Validation, Not Just App Config Intent

- **Date:** 2026-03-07
- **Context:** Production `app.config.js` no longer defined ATS exceptions, but `npx expo config --type introspect` still emitted `NSAppTransportSecurity.NSAllowsArbitraryLoads: true`.
- **Error:** Relying on `ios.infoPlist` intent alone was not enough; Expo/plugin resolution could still widen the final iOS `Info.plist` beyond the plain config output.
- **Why it happened:** Expo’s resolved native config can differ from the raw app config because plugins and platform transforms run after the initial config object is produced.
- **Fix applied:** Added a final `withInfoPlist` hardening plugin in `apps/mobile/app.config.js` to delete ATS keys in production after plugin application, then re-ran `EAS_BUILD_PROFILE=production npx expo config --type introspect` to confirm only calendar permissions remained.
- **Prevention rule:** For App Store review work, trust the resolved introspected config over the raw app config and add a final cleanup plugin when Expo/plugin transforms reintroduce unwanted native keys.
- **Follow-up checks:** `EAS_BUILD_PROFILE=production npx expo config --type introspect`.

### 2026-03-06 — Schema Parity Alone Is Not Backend Parity

- **Date:** 2026-03-06
- **Context:** Root-doc reconciliation initially treated Supabase migration parity as equivalent to full backend parity.
- **Error:** Local and hosted schema versions matched, but edge-function inventory did not (`staff_send_job_opportunity_notification` existed locally yet was absent from hosted `supabase functions list`).
- **Why it happened:** Verification steps focused on `supabase migration list` and did not include a local-vs-hosted function slug comparison.
- **Fix applied:** Added explicit function-inventory parity checks to root process docs and updated planning/architecture docs to call out the missing deployment instead of assuming full parity.
- **Prevention rule:** Backend parity sign-off requires both migration parity and function inventory parity; never mark a backend feature "deployed" from schema parity alone.
- **Follow-up checks:** `supabase migration list` and `supabase functions list` were run and documented in root docs.
