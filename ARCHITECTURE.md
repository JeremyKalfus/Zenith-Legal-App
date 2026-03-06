# Architecture

> Extends `docs/architecture.md`. See also `docs/secrets.md` and `docs/release.md`.

## System Overview

```
┌─────────────────┐     ┌─────────────────┐
│  Mobile App     │     │  Admin Dashboard │
│  (Expo/RN)      │     │  (Next.js)       │
│  apps/mobile/   │     │  apps/admin/     │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         │   HTTPS (REST + Realtime)
         ▼                       ▼
┌──────────────────────────────────────────┐
│           Supabase Gateway               │
│  (Auth, PostgREST, Realtime, Storage)    │
└──────┬──────────────┬────────────────────┘
       │              │
       ▼              ▼
┌─────────────┐  ┌──────────────────┐
│  Edge Fns   │  │  PostgreSQL 15   │
│  (Deno)     │──│  (RLS enforced)  │
│  supabase/  │  │  supabase/       │
│  functions/ │  │  migrations/     │
└──────┬──────┘  └──────────────────┘
       │
       ▼
┌─────────────────┐
│  External APIs  │
│  - Stream Chat  │
│  - Sentry       │
│  - PostHog      │
└─────────────────┘
```

## Workspace Layout

| Workspace | Path | Stack | Purpose |
|---|---|---|---|
| Mobile | `apps/mobile/` | Expo SDK 54, React Native 0.81, React Navigation, react-hook-form, Zod, expo-auth-session, expo-web-browser, stream-chat-expo (native), stream-chat-react (web) | Candidate and staff mobile app; web build via Expo web |
| Admin | `apps/admin/` | Next.js 16, React 19, Tailwind 4, shadcn primitives, Zod | Recruiter web dashboard |
| Privacy Policy Web | `apps/privacy-policy/` | Static HTML/CSS, Vercel config | Public, English-only privacy policy page for app-store compliance and external policy linking |
| Shared | `packages/shared/` | TypeScript, Zod | Domain types, validation schemas, phone utilities, staff-messaging helpers, candidate filter/normalization helpers |
| Backend | `supabase/` | PostgreSQL 15, Deno edge functions, `@supabase/supabase-js@2.57.4` | Database, auth, serverless API |

## Edge Functions

All edge functions live under `supabase/functions/` and share utilities from `_shared/` (HTTP helpers, Supabase client factories, audit logging).

| Function | Auth | Purpose |
|---|---|---|
| `check_candidate_signup_email` | Public | Candidate sign-up precheck for email availability before routing into signup completion |
| `register_candidate_password` | Public | Candidate account creation from auth menu sign-up (email/password) with initial `onboarding_complete = false` |
| `mobile_sign_in_with_identifier_password` | Public | Optional identifier/password sign-in endpoint (present in backend contract; current mobile flow signs in directly via Supabase Auth password grant) |
| `create_or_update_candidate_profile` | User JWT | Intake profile upsert |
| `delete_my_account` | User JWT | Candidate/staff self-service account deletion; staff self-delete is blocked for the last remaining staff account, and deleted-staff appointment ownership is reassigned before auth deletion |
| `schedule_or_update_appointment` | User JWT | Appointment create/update for candidates and staff; accepts Date/Time + note style payloads (with internal 30-minute end-time normalization), enqueues notifications/reminders/calendar sync, posts `Appointment request sent and waiting for admin approval...` on candidate pending submit, posts `Appointment scheduled...` on staff direct scheduled creates, and posts `Scheduled appointment modified...` on staff updates |
| `manage_appointment_lifecycle` | User JWT | Appointment lifecycle action endpoint: `ignore_overdue` (hard delete scheduled-overdue), `cancel_outgoing_request` (hard delete candidate-created pending request), and `cancel_upcoming` (chat + notification + calendar unsync side-effects, then hard delete) |
| `authorize_firm_submission` | User JWT | Candidate authorizes/declines firm |
| `chat_auth_bootstrap` | User JWT | Provisions Stream Chat token; candidates (and staff targeting a candidate) also get/create deterministic `candidate-<user_id>` channel. Staff can omit `user_id` to bootstrap inbox listing without creating/selecting a channel. Returns 404 if `users_profile` row missing (no fallback creation) |
| `connect_calendar_provider` | User JWT | Connect Apple calendar credentials/tokens for per-user appointment sync |
| `staff_review_appointment` | Staff JWT | Review appointment requests (pending -> scheduled/declined with overlap detection), enqueue notifications/reminders, trigger calendar sync, and post action-specific chat intros (`Appointment request accepted and scheduled...` / `Appointment request declined...`) |
| `assign_firm_to_candidate` | Staff JWT | Assign firm to candidate and post candidate-channel chat updates |
| `staff_update_assignment_status` | Staff JWT | Update assignment status |
| `staff_unassign_firm_from_candidate` | Staff JWT | Remove firm assignment |
| `staff_delete_user` | Staff JWT | Hard-delete candidate or staff user accounts from admin workflow; rejects self-delete, protects the last remaining staff account, reassigns staff-created appointment ownership, and clears non-cascading refs before auth deletion |
| `staff_update_user_role` | Staff JWT | Promote candidate accounts to staff from admin workflow (`candidate -> staff`) |
| `bulk_paste_ingest_firms` | Staff JWT | Bulk firm data import |
| `staff_handle_data_request` | Staff JWT | Process support/data requests |
| `staff_send_job_opportunity_notification` | Staff JWT | Queue a manually composed recruiter push notification for the currently targeted candidate set after server-side consent and deliverability revalidation. Implemented in repo and configured in `supabase/config.toml`; deployment to linked hosted project is still pending as of 2026-03-06. |
| `dispatch_notifications` | Internal | Dual-mode notification function: enqueue events into `notification_deliveries` or process due queued push deliveries (`send_after_utc <= now`) via Expo Push API (email provider integration pending). Supports `appointment.reminder` events for 15-minute pre-meeting pushes. Internal helpers: `fetchTokensByUser`, `processSingleDelivery`, `revokeStaleTokens`, `claimQueuedPushDelivery`, `markDeliveryStatus` |
| `process_chat_webhook` | Webhook signature | Handle Stream Chat events |

**JWT handling:** All functions set `verify_jwt = false` in `supabase/config.toml` to bypass gateway-level JWT verification (required due to the project's JWT signing key format). Auth is enforced internally via `getCurrentUserId()` which extracts the Bearer token and calls `getUser(token)`.

Hosted Supabase deployment snapshot (linked project `njxgoypivrxyrukpouxb`, checked 2026-03-06):
- Migration parity is clean: local and hosted both include every migration through `20260306130500`.
- Edge-function inventory is not fully in parity: 21 function directories exist locally (excluding `_shared`), while 20 are active remotely.
- Missing remotely: `staff_send_job_opportunity_notification` (local-only until deployed).

## Database Schema

Source of truth is 25 SQL migrations in `supabase/migrations/` with hosted schema parity confirmed via `supabase migration list` (local = remote through `20260306130500` on linked project ref `njxgoypivrxyrukpouxb` as of 2026-03-06).

Current enum state (post-migrations):
- `public.user_role`: `candidate`, `staff`
- `public.firm_status`: includes `Authorized, will submit soon` in addition to waiting/submitted/interview/rejected/offer states
- `public.appointment_status`: `scheduled`, `cancelled`, `pending`, `accepted`, `declined` (runtime app contract normalizes to `pending|scheduled|declined|cancelled`)
- `public.calendar_provider`: `apple`, `microsoft` (Google removed by migration)
- `public.notification_channel`: `push`, `email`
- `public.support_request_type`: `export`, `delete`
- `public.support_request_status`: `open`, `in_progress`, `completed`, `rejected`

Key tables and constraints:
- `users_profile`
  - PK `id` (`auth.users.id`, `on delete cascade`)
  - Columns: `role`, `name`, `email`, `mobile`, `jd_degree_date`, `onboarding_complete`, timestamps
  - Unique indexes: `users_profile_mobile_unique_idx` (`mobile`), `users_profile_email_lower_unique_idx` (`lower(email)`)
- `candidate_preferences`
  - PK/FK `user_id -> users_profile.id`
  - Columns: `cities[]`, `other_city_text`, `practice_area` (legacy enum), `practice_areas[]` (current multi-select), `other_practice_text`, timestamps
  - Constraints: max 3 practice areas; value whitelist enforced at DB constraint level
- `candidate_consents`
  - PK/FK `user_id -> users_profile.id`
  - Privacy/communication consent booleans + accepted-at + version fields
  - DB checks enforce that privacy/communication acceptance metadata must be null when the corresponding boolean is `false`
  - Recruiter push consent columns (2026-03-06 migration):
    - `job_opportunity_push_accepted boolean not null default false`
    - `job_opportunity_push_accepted_at timestamptz`
    - `job_opportunity_push_version text`
  - Push-consent metadata columns currently do not have an equivalent SQL check constraint; enforcement is in edge-function write logic
  - `source` records write origin (`mobile_app` default)
- `firms`
  - PK `id`, unique `normalized_name`, JSON metadata field, active flag
  - Select policy restricted to assigned candidate or staff (`firms_assigned_or_staff_select`)
- `candidate_firm_assignments`
  - PK `id`, unique (`candidate_user_id`, `firm_id`)
  - Tracks current `status_enum`, `status_updated_at`, assignment actor and timestamps
- `candidate_authorizations`
  - PK `id`, unique (`assignment_id`)
  - Stores candidate decision + timestamp with self-owned update policy checks
- `appointments`
  - PK `id`; candidate + creator FKs to `users_profile`
  - Stores modality, location/video fields, UTC start/end, timezone label, status
  - `created_by_user_id` is declared `not null` with FK `on delete set null`; application deletion flows reassign creator ownership before deleting staff users to avoid FK/null conflicts
  - Exclusion constraint `appointments_no_overlapping_scheduled_per_candidate` prevents overlapping `scheduled` windows per candidate
  - Insert policy allows candidate self-create and staff create (`appointments_create_self_or_staff`)
- `appointment_participants`
  - PK `id`, unique (`appointment_id`, `user_id`)
  - Tracks candidate/staff appointment participants
- `calendar_connections`
  - PK `id`, unique (`user_id`, `provider`)
  - Stores encrypted OAuth payload + sync state blob
- `calendar_event_links`
  - PK `id`, unique (`appointment_id`, `provider`, `user_id`)
  - Includes provider event ID, sync hash, provider event URL, user ownership
- `notification_preferences`
  - PK/FK `user_id -> users_profile.id`
  - `push_enabled`, `email_enabled`, per-category toggles JSON
- `push_tokens`
  - PK `id`, unique (`user_id`, `expo_push_token`)
  - Tracks platform, `last_seen_at`, and soft revocation (`revoked_at`)
- `notification_deliveries`
  - PK `id`
  - Queue fields: `user_id`, `channel`, `event_type`, `payload`, `status`, `created_at`
  - Delayed send support: `send_after_utc` + dispatch index `idx_notification_deliveries_dispatch_queue`
- `recruiter_contact_config`
  - Global recruiter phone/email banner source with `is_active` and updater tracking
- `candidate_recruiter_contact_overrides`
  - PK/FK `candidate_user_id -> users_profile.id`
  - Candidate-specific recruiter phone/email overrides + updater tracking
- `candidate_recruiter_assignments`
  - PK/FK `candidate_user_id -> users_profile.id`
  - Nullable `recruiter_user_id` (`on delete set null`) supports explicit unassigned state
  - Staff-only RLS select/write policies
- `audit_events`
  - Immutable operational ledger (`actor_user_id`, action/entity tuple, before/after JSON, timestamp)
- `support_data_requests`
  - Data export/delete workflow queue with staff handler fields and status progression

Triggers and helper functions:
- `public.set_updated_at()` updates `updated_at` columns across profile/preferences/firms/assignments/appointments/calendar connections/notification preferences/support requests, plus recruiter override/assignment tables added in later migrations.
- `public.audit_trigger()` writes insert/update/delete snapshots to `audit_events`; later migrations extended non-`id` PK support (`user_id`, `candidate_user_id`).
- `public.is_staff()` is the primary RLS helper and is reused by table policies and edge-function assumptions.

RLS model:
- Every application table in `public` is RLS-enabled.
- Candidate-owned tables allow `self` access and staff override via `public.is_staff()`.
- Staff-only write paths are enforced by RLS + edge-function `assertStaff()` checks.
- Policy changes for feature work are migration-managed (for example firms visibility narrowing, staff appointment insert policy, calendar event link ownership scoping, and staff-only recruiter assignment/override tables).

## Calendar Connection UX (Mobile)

- `apps/mobile/src/components/calendar-sync-card.tsx` is a shared profile settings card used by both candidate and staff Profile tabs.
- Apple setup is a one-tap connect path that stores provider state through `connect_calendar_provider`.
- Connection status is read from `calendar_connections` (`provider`, `sync_state`, `updated_at`) with user-scoped RLS access.
- Appointment screens run device-native calendar sync via `expo-calendar` (candidate + staff), creating/updating scheduled events and removing declined/cancelled events from device calendars when provider connection is enabled.
- Candidate Profile renders settings as collapsible cards (`Change Profile Details`, `Calendar Sync`, `Change Email or Password`) with profile details expanded by default.

## Shared Package (`@zenith/shared`)

The shared package (`packages/shared/`) exports modules consumed by both admin and mobile workspaces:

- **`domain.ts`** -- Zod schemas, enums, and TypeScript types for the domain model.
- **`phone.ts`** -- Phone number formatting and validation utilities.
- **`staff-messaging.ts`** -- Staff messaging helpers consolidated from duplicate implementations in admin and mobile: `StaffMessageInboxItem` type, `parseCandidateUserIdFromChannelId`, `mapChannelsToStaffInboxItems`, `formatRelativeTimestamp`.
- **`candidate-filters.ts`** -- Candidate preference normalization and shared filtering helpers: legacy city/practice/JD chip filtering (`search AND (city OR practice OR JD year)`) plus recruiter-mobile structured filtering (`search AND` assigned recruiter/current status/single-practice with OR-matched assigned firms/preferred cities/JD years).

The package uses `"main": "src/index.ts"` for source-first workspace imports. It also defines `npm run build -w @zenith/shared` to emit declarations to `packages/shared/dist` for CI/release verification. Admin consumes it via `transpilePackages: ['@zenith/shared']` in `next.config.ts`. Mobile consumes it directly.

Staff candidate list flows (mobile `staff-candidates-screen` and admin `candidate-firm-manager`) now hydrate profile rows from `users_profile` with `candidate_preferences` (`cities`, `practice_areas`, `practice_area`) and apply the shared filter helper for consistent behavior across both surfaces, including JD graduation year filtering via `users_profile.jd_degree_date`.
The same staff candidate profile surfaces render candidate identity details and JD year for recruiter/admin visibility (derived from `users_profile.jd_degree_date`).
Recruiter mobile candidate flows also hydrate assignment aggregates (`candidate_firm_assignments`) and recruiter ownership (`candidate_recruiter_assignments`) to support current-status filtering, assigned-firm filtering, and recruiter assignment/set-to-none actions.
The same mobile recruiter candidate loading path also hydrates `candidate_consents.job_opportunity_push_accepted` so the shared filter model can evaluate recruiter send eligibility client-side before the server performs a second validation pass.

JD year contract details:
- Mobile/auth/shared app contracts validate and transmit JD values as `YYYY` strings (`2000..currentYear-1`).
- Edge functions map year input to DB-compatible `jd_degree_date` values (`YYYY-01-01`) on writes.
- Mobile profile hydration maps stored `jd_degree_date` back to `YYYY` before binding form state.
- Shared label/filter helpers support legacy `YYYY-MM-DD` rows and year-only strings during transition.

## Mobile Theme System

The mobile app centralizes all UI colors in `apps/mobile/src/theme/colors.ts` via the `uiColors` object. This replaces inline hex color values with semantic tokens (`textPrimary`, `surface`, `border`, `error`, `link`, etc.). All screen-level `StyleSheet` definitions reference `uiColors.*` instead of hardcoded color strings.

Firm status badges in mobile listings use semantic `uiColors` status tokens for each pipeline stage (`Waiting`, `Authorized`, `Submitted`, `Interview`, `Rejected`, `Offer`).

## Recruiter Contact Banner Resolution (Mobile)

- `RecruiterContactProvider` resolves contact info in precedence order: candidate override (`candidate_recruiter_contact_overrides`) → global active config (`recruiter_contact_config`) → env defaults (`EXPO_PUBLIC_RECRUITER_PHONE`/`EXPO_PUBLIC_RECRUITER_EMAIL`).
- Candidate overrides are loaded only when the authenticated profile role is `candidate`.
- Staff can set/reset candidate-specific overrides from `staff-candidate-firms-screen`; candidate banners render those values everywhere candidate context is available.

## Recruiter Candidate Filter Search (Mobile)

- `staff-candidates-screen` keeps free-text search and launches a dedicated `staff-candidate-filters-screen` for structured filters.
- Filter state supports `assigned recruiter` (`any|none|staff-user-id`), `current status`, `practice`, `assigned firms[]`, `preferred cities[]`, `jd years[]`, and `job opportunity push consent` (`any|accepted|not_accepted`).
- `Clear` resets all filters to `Any`; `Apply` navigates back to the candidate list with params and applies filters immediately.
- Filter evaluation is centralized in `@zenith/shared` (`filterStaffCandidates`) for deterministic UI behavior.
- The same filter surface includes a manual `Send Notification` flow that opens a recruiter composer (`title` + `message`), summarizes the current filtered/consented audience, and invokes `staff_send_job_opportunity_notification`.

## Job-Opportunity Push Consent and Delivery

- Source of truth for recruiter job-opportunity push consent is `candidate_consents.job_opportunity_push_accepted`; timestamp/version companions are persisted alongside it.
- Global notification suppression remains `notification_preferences.push_enabled`; queue-time delivery checks require both recruiter-specific consent and global push enablement, plus at least one non-revoked Expo push token.
- Mobile notification registration is split into:
  - silent sync when native notification permission is already granted (`syncPushTokenIfPermitted`)
  - explicit permission prompt + registration only when the candidate enables the recruiter job-opportunity consent (`requestPushPermissionAndRegister`)
- Web renders the opt-in control but does not attempt browser push registration.
- `dispatch_notifications` now has a dedicated `job_opportunity.match` payload path so recruiter-composed `title` and `body` are preserved in the outgoing push instead of falling back to generic copy.

## Component Pattern: Custom Hook Extraction

Large React components in both admin and mobile follow a hook-extraction pattern: state management, side effects, refs, and handler functions are extracted into a co-located `useXxxScreen` or `useXxxDashboard` hook. The component itself is pure JSX that receives values and callbacks from the hook. This keeps render logic separate from business logic and reduces per-file line counts.

Refactored components using this pattern:
- `apps/admin/src/components/modules/staff-messages-dashboard.tsx` → `useStaffMessagesDashboard`
- `apps/admin/src/components/modules/candidate-firm-manager.tsx` → `useCandidateFirmManager`
- `apps/admin/src/components/modules/operations-dashboard.tsx` → `useOperationsDashboard`
- `apps/admin/src/components/modules/staff-account-manager.tsx` → `useStaffAccountManager`
- `apps/mobile/src/screens/candidate/profile-screen.tsx` → `useProfileScreen`
- `apps/mobile/src/screens/candidate/appointments-screen.tsx` → `useAppointmentsScreen`
- `apps/mobile/src/screens/staff/staff-appointments-screen.tsx` → `useStaffAppointmentsScreen`
- Appointments surfaces render section buckets derived from shared helper logic (`packages/shared/src/appointment-sections.ts`) with overdue/upcoming boundaries based on `start_at_utc`.
- Appointment cards across candidate/staff/admin use candidate/date/time overview plus clamped note preview and inline expansion.

## Auth Flows

- **Password**: unauthenticated candidates land on a single `Sign Up`/`Log In` menu screen. `Sign Up` is email-first: it calls `check_candidate_signup_email`, then routes available emails to intake signup completion. `register_candidate_password` creates the auth user + minimal candidate profile with `onboarding_complete = false`. Current sign-in screens use Supabase password grant directly (web SDK path with native REST fallback).
- **Signup completion**: candidates coming from email-first sign-up complete intake fields plus password/confirm-password on a `Finish your profile` screen variant with the email field locked to the prechecked value.
- **Post-signup onboarding**: authenticated candidates with `users_profile.onboarding_complete = false` are routed to `IntakeScreen` in `finishProfile` mode. Submitting this flow calls `create_or_update_candidate_profile`, which sets `onboarding_complete = true` and unlocks candidate tabs.
- **Magic link**: Supabase built-in email magic-link methods are available at the auth layer.
- **SMS OTP**: Supabase built-in phone OTP methods exist in auth context plumbing (provider/config dependent).
- **Session management**: Expo SecureStore (mobile) or localStorage (web) for token persistence. `autoRefreshToken: true` enabled. Client-side `ensureValidSession()` helper proactively refreshes tokens nearing expiry.
- **Staff chat bootstrap hardening**: Admin web staff dashboard/message flows and mobile staff tab indicators call `ensureValidSession()` before invoking `chat_auth_bootstrap`, preventing stale-session auth failures after backgrounding or idle time.
- **Thread readiness hardening**: Candidate/staff message thread surfaces now wait for `channel.watch()` completion before rendering `Channel`/`MessageList`, avoiding false "unable to load messages" errors when channel state is not hydrated yet.
- **Revoked/deleted session recovery**: Mobile auth bootstrap detects invalid/missing refresh tokens (for example after account deletion or server-side revocation), clears the persisted local session, and fails open to the sign-in screen instead of repeatedly retrying refresh on startup.
- **Edge function errors**: Client uses `getFunctionErrorMessage()` to read the actual error from `FunctionsHttpError.context` (Response body); uses `Response.clone()` when available so the body is not consumed. Avoids generic "Edge Function returned a non-2xx status code" when the function returns JSON `{ error: "..." }`.
- **Profile write validation semantics**: Intake/profile submitters send required consent booleans explicitly, and `create_or_update_candidate_profile` responds with combined form-level + field-level validation messages (422) rather than generic payload failures.
- **Chat bootstrap modes**: `chat_auth_bootstrap` supports (1) candidate self-bootstrap, (2) staff bootstrap for a specific candidate channel via `user_id`, and (3) staff token-only bootstrap for inbox channel listing when `user_id` is omitted.
- **Admin web staff messaging**: Admin dashboard staff users use the same `chat_auth_bootstrap` token-only inbox bootstrap + candidate-channel bootstrap flow as the main app, powered by Stream Chat (`NEXT_PUBLIC_STREAM_API_KEY` on admin web).
- **Admin web staff account deletion**: `/dashboard/staff-accounts` lists recruiter users from `users_profile`, invokes `staff_delete_user`, blocks self-delete in the UI and server contract, and preserves scheduled appointment records by reassigning deleted-staff `created_by_user_id` values to the appointment candidate before auth deletion.
- **Chat profile sync**: `chat_auth_bootstrap` upserts candidate Stream users with profile name metadata, and admin inbox previews enrich channel rows from `users_profile` so recruiter conversation previews show candidate names/initials.

## Secrets and Configuration

See `docs/secrets.md` for the full inventory. Secrets are provided via:

- `.env` files locally (excluded from git via `.gitignore`)
- GitHub Actions secrets for CI
- EAS secrets for mobile builds
- Vercel environment variables for admin deploys (privacy policy static site does not require runtime env vars)
- Supabase dashboard for edge function environment variables

Required environment variables (placeholders):

- **Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (edge functions get these automatically; mobile/admin use `.env` or equivalent).
- **Stream Chat:** `STREAM_API_KEY`, `STREAM_API_SECRET` set in Supabase Dashboard → Edge Functions → secrets (for `chat_auth_bootstrap`, `process_chat_webhook`). Client uses `EXPO_PUBLIC_STREAM_API_KEY` (mobile app config or env).

## Environments

See `docs/release.md` for full environment strategy.

| Environment | Purpose | Supabase | Admin Deploy |
|---|---|---|---|
| dev | Local development | Local or hosted project | `npm run dev:admin` |
| staging | QA and UAT | Dedicated project | Vercel preview |
| prod | Production release | Dedicated project | Vercel production |

## Mobile Release Infrastructure (EAS / Stores)

As of **2026-03-03**, the Expo mobile app has a production store-build baseline configured:

- **Expo/EAS project:** `@jeremykalfus/zenith-legal-mobile`
- **EAS project ID:** `38f93994-daaa-4c85-a092-a70ac12f0c06`
- **Production app identifier (iOS + Android):** `com.zenithlegal.app`
- **Apple Developer App ID:** `com.zenithlegal.app` (Push Notifications enabled; Broadcast Capability disabled)
- **App Store Connect app record:** `Zenith Legal` (bundle ID `com.zenithlegal.app`, SKU `zenith-legal-ios-prod`)

Version/build configuration:

- `apps/mobile/eas.json` uses `cli.appVersionSource = "remote"` so EAS manages production `buildNumber`/`versionCode`
- `apps/mobile/eas.json` production profile uses `autoIncrement: true`
- `apps/mobile/eas.json` submit profile includes `ios.ascAppId = "6759677619"` to bypass EAS App Store Connect app auto-lookup during submit
- `apps/mobile/app.json` includes iOS export-compliance flag `ITSAppUsesNonExemptEncryption = false`
- `apps/mobile/package.json` includes iOS release scripts:
  - `release:ios` -> `npx eas-cli build -p ios --profile production --auto-submit --non-interactive`
  - `release:ios:status` -> latest iOS build output + EAS submissions page link
  - `release:ios:submit-latest` -> `npx eas-cli submit -p ios --profile production --latest --non-interactive`

Credential state (EAS-managed):

- **Android:** production signing keystore created for package `com.zenithlegal.app`
- **iOS:** Apple Distribution Certificate + Provisioning Profile created for bundle ID `com.zenithlegal.app`
- **iOS APNs key:** configured in EAS (Apple Push key assigned to `com.zenithlegal.app`)
- **iOS submit API credentials:** configured in EAS (App Store Connect API key for EAS Submit)
- **Android submit API credentials:** pending (Google Play service account not configured yet)
- **EAS production runtime env vars (`EXPO_PUBLIC_*`):** pending (first TestFlight build was created without these and used placeholder config values)

Build / submission snapshot (2026-03-03):

- iOS production build finished: `36ca22cc-f921-431c-a24b-5adfd6d7871c` (IPA artifact generated)
- Android production build finished: `3c84ffe0-aa34-444e-8f52-cc43bef37bd4` (AAB artifact generated)
- iOS EAS submission scheduled to App Store Connect: `25b4cdb9-7d8a-4b4a-af49-8dcf53994ff0` (processing status depends on Apple)
- EAS submit scheduling did not result in an Apple-visible build for this run; manual Transporter upload of the IPA was used as fallback and succeeded
- App Store Connect / TestFlight now shows iOS build `1.0.0 (2)` upload complete and processed (`Ready to Submit`), but app sign-in fails because the build was compiled with placeholder Supabase config (missing EAS production env vars)
- 2026-03-03 local release run: iOS production build `df944362-c6d6-4f92-826d-12126e8253e2` finished for commit `8ea2e6deb4a6086ca1fef913d7c17c487a5a687c`; IPA artifact URL: `https://expo.dev/artifacts/eas/tBi2294fFb2jrRuJLK8Ceq.ipa`
- 2026-03-03 production run: iOS build `72d675a2-6ca6-49c8-b10e-473de6c0012c` finished (`1.0.0 (11)`) and was submitted via EAS submit (`d140f9be-d8a4-482e-8839-a964b55c928e`)

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main` and all PRs:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. Build shared package
6. Build admin app

Mobile store builds/submissions are run manually via Expo EAS from `apps/mobile/` and are not part of GitHub Actions CI. Default iOS operational path is `npm run release:ios -w @zenith/mobile`; Transporter is fallback-only.
