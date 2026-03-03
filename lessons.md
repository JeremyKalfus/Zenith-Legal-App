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
