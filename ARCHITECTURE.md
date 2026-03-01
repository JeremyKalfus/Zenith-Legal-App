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
| Shared | `packages/shared/` | TypeScript, Zod | Domain types, validation schemas, phone utilities, staff-messaging helpers, candidate filter/normalization helpers |
| Backend | `supabase/` | PostgreSQL 15, Deno edge functions, `@supabase/supabase-js@2.57.4` | Database, auth, serverless API |

## Edge Functions

All edge functions live under `supabase/functions/` and share utilities from `_shared/` (HTTP helpers, Supabase client factories, audit logging).

| Function | Auth | Purpose |
|---|---|---|
| `check_candidate_signup_email` | Public | Candidate sign-up precheck for email availability before routing into signup completion |
| `register_candidate_password` | Public | Candidate account creation from auth menu sign-up (email/password) with initial `onboarding_complete = false` |
| `mobile_sign_in_with_identifier_password` | Public | Password sign-in |
| `create_or_update_candidate_profile` | User JWT | Intake profile upsert |
| `delete_my_account` | User JWT | Candidate self-service account deletion (hard delete auth user + cascaded app data; non-cascading refs nulled first) |
| `schedule_or_update_appointment` | User JWT | Appointment create/update for candidates and staff; accepts Date/Time + note style payloads (with internal 30-minute end-time normalization), enqueues notifications/reminders/calendar sync, posts `Appointment request sent and waiting for admin approval...` on candidate pending submit, posts `Appointment scheduled...` on staff direct scheduled creates, and posts `Scheduled appointment modified...` on staff updates |
| `manage_appointment_lifecycle` | User JWT | Appointment lifecycle action endpoint: `ignore_overdue` (hard delete scheduled-overdue), `cancel_outgoing_request` (hard delete candidate-created pending request), and `cancel_upcoming` (chat + notification + calendar unsync side-effects, then hard delete) |
| `authorize_firm_submission` | User JWT | Candidate authorizes/declines firm |
| `chat_auth_bootstrap` | User JWT | Provisions Stream Chat token; candidates (and staff targeting a candidate) also get/create deterministic `candidate-<user_id>` channel. Staff can omit `user_id` to bootstrap inbox listing without creating/selecting a channel. Returns 404 if `users_profile` row missing (no fallback creation) |
| `connect_calendar_provider` | User JWT | Connect Google/Apple calendar credentials/tokens for per-user appointment sync |
| `staff_review_appointment` | Staff JWT | Review appointment requests (pending -> scheduled/declined with overlap detection), enqueue notifications/reminders, trigger calendar sync, and post action-specific chat intros (`Appointment request accepted and scheduled...` / `Appointment request declined...`) |
| `assign_firm_to_candidate` | Staff JWT | Assign firm to candidate and post candidate-channel chat updates |
| `staff_update_assignment_status` | Staff JWT | Update assignment status |
| `staff_unassign_firm_from_candidate` | Staff JWT | Remove firm assignment |
| `staff_delete_user` | Staff JWT | Hard-delete candidate user accounts from admin workflow (candidate-only scope) |
| `staff_update_user_role` | Staff JWT | Promote candidate accounts to staff from admin workflow (`candidate -> staff`) |
| `bulk_paste_ingest_firms` | Staff JWT | Bulk firm data import |
| `staff_handle_data_request` | Staff JWT | Process support/data requests |
| `dispatch_notifications` | Internal | Dual-mode notification function: enqueue events into `notification_deliveries` or process due queued push deliveries (`send_after_utc <= now`) via Expo Push API (email provider integration pending). Supports `appointment.reminder` events for 15-minute pre-meeting pushes. Internal helpers: `fetchTokensByUser`, `processSingleDelivery`, `revokeStaleTokens`, `claimQueuedPushDelivery`, `markDeliveryStatus` |
| `process_chat_webhook` | Webhook signature | Handle Stream Chat events |

**JWT handling:** All functions set `verify_jwt = false` in `supabase/config.toml` to bypass gateway-level JWT verification (required due to the project's JWT signing key format). Auth is enforced internally via `getCurrentUserId()` which extracts the Bearer token and calls `getUser(token)`.

## Database Schema

23 migrations in `supabase/migrations/`. Key tables:

- `users_profile` -- User identity and role (candidate/staff)
- `users_profile` includes candidate profile metadata used across mobile/admin surfaces (`jd_degree_date`)
- `candidate_preferences` -- Cities, practice_areas (array, max 3), optional practice_area (legacy)
- `candidate_consents` -- Privacy and communication consents with versioning
- `firms` -- Law firm directory
- `candidate_firm_assignments` -- Staff-managed candidate-to-firm assignments
- `candidate_authorizations` -- Candidate decisions on firm submissions
- `appointments` / `appointment_participants` -- Scheduling with scheduled-overlap constraints and explicit participant tracking for candidate/staff reminders + calendar sync
- `calendar_connections` / `calendar_event_links` -- Calendar provider connection and sync tracking, keyed per appointment+provider+user
- `notification_preferences` / `push_tokens` / `notification_deliveries` -- Notification pipeline with delayed delivery support via `send_after_utc`
- `audit_events` -- Immutable audit log
- `support_data_requests` -- Candidate support requests
- `recruiter_contact_config` -- Configurable recruiter phone/email for mobile banner
- `candidate_recruiter_contact_overrides` -- Per-candidate recruiter banner phone/email overrides managed by staff
- `candidate_recruiter_assignments` -- Per-candidate recruiter ownership assignment (`candidate_user_id -> recruiter_user_id`, nullable for unassigned)

All tables enforce Row Level Security. Staff-only mutations are routed through edge functions that call `assertStaff()`.

## Calendar Connection UX (Mobile)

- `apps/mobile/src/components/calendar-sync-card.tsx` is a shared profile settings card used by both candidate and staff Profile tabs.
- Google Calendar setup uses `expo-auth-session` (`AuthRequest` + PKCE + authorization code exchange) and sends tokens to `connect_calendar_provider`.
- Apple setup is a one-tap connect path that stores provider state through `connect_calendar_provider`.
- Connection status is read from `calendar_connections` (`provider`, `sync_state`, `updated_at`) with user-scoped RLS access.
- Mobile Google OAuth client configuration is provided via `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`.
- Appointment screens run device-native calendar sync via `expo-calendar` (candidate + staff), creating/updating scheduled events and removing declined/cancelled events from device calendars when provider connection is enabled.

## Shared Package (`@zenith/shared`)

The shared package (`packages/shared/`) exports modules consumed by both admin and mobile workspaces:

- **`domain.ts`** -- Zod schemas, enums, and TypeScript types for the domain model.
- **`phone.ts`** -- Phone number formatting and validation utilities.
- **`staff-messaging.ts`** -- Staff messaging helpers consolidated from duplicate implementations in admin and mobile: `StaffMessageInboxItem` type, `parseCandidateUserIdFromChannelId`, `mapChannelsToStaffInboxItems`, `formatRelativeTimestamp`.
- **`candidate-filters.ts`** -- Candidate preference normalization and shared filtering helpers: legacy city/practice/JD chip filtering (`search AND (city OR practice OR JD year)`) plus recruiter-mobile structured filtering (`search AND` assigned recruiter/current status/single-practice with OR-matched assigned firms/preferred cities/JD years).

The package uses `"main": "src/index.ts"` (no build step). Admin consumes it via `transpilePackages: ['@zenith/shared']` in `next.config.ts`. Mobile consumes it directly.

Staff candidate list flows (mobile `staff-candidates-screen` and admin `candidate-firm-manager`) now hydrate profile rows from `users_profile` with `candidate_preferences` (`cities`, `practice_areas`, `practice_area`) and apply the shared filter helper for consistent behavior across both surfaces, including JD graduation year filtering via `users_profile.jd_degree_date`.
The same staff candidate profile surfaces render candidate identity details and `users_profile.jd_degree_date` for recruiter/admin visibility.
Recruiter mobile candidate flows also hydrate assignment aggregates (`candidate_firm_assignments`) and recruiter ownership (`candidate_recruiter_assignments`) to support current-status filtering, assigned-firm filtering, and recruiter assignment/set-to-none actions.

## Mobile Theme System

The mobile app centralizes all UI colors in `apps/mobile/src/theme/colors.ts` via the `uiColors` object. This replaces inline hex color values with semantic tokens (`textPrimary`, `surface`, `border`, `error`, `link`, etc.). All screen-level `StyleSheet` definitions reference `uiColors.*` instead of hardcoded color strings.

Firm status badges in mobile listings use semantic `uiColors` status tokens for each pipeline stage (`Waiting`, `Authorized`, `Submitted`, `Interview`, `Rejected`, `Offer`).

## Recruiter Contact Banner Resolution (Mobile)

- `RecruiterContactProvider` resolves contact info in precedence order: candidate override (`candidate_recruiter_contact_overrides`) → global active config (`recruiter_contact_config`) → env defaults (`EXPO_PUBLIC_RECRUITER_PHONE`/`EXPO_PUBLIC_RECRUITER_EMAIL`).
- Candidate overrides are loaded only when the authenticated profile role is `candidate`.
- Staff can set/reset candidate-specific overrides from `staff-candidate-firms-screen`; candidate banners render those values everywhere candidate context is available.

## Recruiter Candidate Filter Search (Mobile)

- `staff-candidates-screen` keeps free-text search and launches a dedicated `staff-candidate-filters-screen` for structured filters.
- Filter state supports `assigned recruiter` (`any|none|staff-user-id`), `current status`, `practice`, `assigned firms[]`, `preferred cities[]`, and `jd years[]`.
- `Clear` resets all filters to `Any`; `Apply` navigates back to the candidate list with params and applies filters immediately.
- Filter evaluation is centralized in `@zenith/shared` (`filterStaffCandidates`) for deterministic UI behavior.

## Component Pattern: Custom Hook Extraction

Large React components in both admin and mobile follow a hook-extraction pattern: state management, side effects, refs, and handler functions are extracted into a co-located `useXxxScreen` or `useXxxDashboard` hook. The component itself is pure JSX that receives values and callbacks from the hook. This keeps render logic separate from business logic and reduces per-file line counts.

Refactored components using this pattern:
- `apps/admin/src/components/modules/staff-messages-dashboard.tsx` → `useStaffMessagesDashboard`
- `apps/admin/src/components/modules/candidate-firm-manager.tsx` → `useCandidateFirmManager`
- `apps/admin/src/components/modules/operations-dashboard.tsx` → `useOperationsDashboard`
- `apps/mobile/src/screens/candidate/profile-screen.tsx` → `useProfileScreen`
- `apps/mobile/src/screens/candidate/appointments-screen.tsx` → `useAppointmentsScreen`
- `apps/mobile/src/screens/staff/staff-appointments-screen.tsx` → `useStaffAppointmentsScreen`
- Appointments surfaces render section buckets derived from shared helper logic (`packages/shared/src/appointment-sections.ts`) with overdue/upcoming boundaries based on `start_at_utc`.
- Appointment cards across candidate/staff/admin use candidate/date/time overview plus clamped note preview and inline expansion.

## Auth Flows

- **Password**: unauthenticated candidates land on a single `Sign Up`/`Log In` menu screen. `Sign Up` is email-first: it calls `check_candidate_signup_email`, then routes available emails to intake signup completion. `register_candidate_password` creates the auth user + minimal candidate profile with `onboarding_complete = false`; `mobile_sign_in_with_identifier_password` signs in existing users.
- **Signup completion**: candidates coming from email-first sign-up complete intake fields plus password/confirm-password on a `Finish your profile` screen variant with the email field locked to the prechecked value.
- **Post-signup onboarding**: authenticated candidates with `users_profile.onboarding_complete = false` are routed to `IntakeScreen` in `finishProfile` mode. Submitting this flow calls `create_or_update_candidate_profile`, which sets `onboarding_complete = true` and unlocks candidate tabs.
- **Magic link**: Supabase built-in email magic link (used for staff).
- **SMS OTP**: Supabase built-in phone OTP.
- **Session management**: Expo SecureStore (mobile) or localStorage (web) for token persistence. `autoRefreshToken: true` enabled. Client-side `ensureValidSession()` helper proactively refreshes tokens nearing expiry.
- **Revoked/deleted session recovery**: Mobile auth bootstrap detects invalid/missing refresh tokens (for example after account deletion or server-side revocation), clears the persisted local session, and fails open to the sign-in screen instead of repeatedly retrying refresh on startup.
- **Edge function errors**: Client uses `getFunctionErrorMessage()` to read the actual error from `FunctionsHttpError.context` (Response body); uses `Response.clone()` when available so the body is not consumed. Avoids generic "Edge Function returned a non-2xx status code" when the function returns JSON `{ error: "..." }`.
- **Chat bootstrap modes**: `chat_auth_bootstrap` supports (1) candidate self-bootstrap, (2) staff bootstrap for a specific candidate channel via `user_id`, and (3) staff token-only bootstrap for inbox channel listing when `user_id` is omitted.
- **Admin web staff messaging**: Admin dashboard staff users use the same `chat_auth_bootstrap` token-only inbox bootstrap + candidate-channel bootstrap flow as the main app, powered by Stream Chat (`NEXT_PUBLIC_STREAM_API_KEY` on admin web).
- **Chat profile sync**: `chat_auth_bootstrap` upserts candidate Stream users with profile name metadata, and admin inbox previews enrich channel rows from `users_profile` so recruiter conversation previews show candidate names/initials.

## Secrets and Configuration

See `docs/secrets.md` for the full inventory. Secrets are provided via:

- `.env` files locally (excluded from git via `.gitignore`)
- GitHub Actions secrets for CI
- EAS secrets for mobile builds
- Vercel environment variables for admin deploys
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

As of **2026-02-25**, the Expo mobile app has a production store-build baseline configured:

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

Credential state (EAS-managed):

- **Android:** production signing keystore created for package `com.zenithlegal.app`
- **iOS:** Apple Distribution Certificate + Provisioning Profile created for bundle ID `com.zenithlegal.app`
- **iOS APNs key:** configured in EAS (Apple Push key assigned to `com.zenithlegal.app`)
- **iOS submit API credentials:** configured in EAS (App Store Connect API key for EAS Submit)
- **Android submit API credentials:** pending (Google Play service account not configured yet)
- **EAS production runtime env vars (`EXPO_PUBLIC_*`):** pending (first TestFlight build was created without these and used placeholder config values)

Build / submission snapshot (2026-02-25):

- iOS production build finished: `36ca22cc-f921-431c-a24b-5adfd6d7871c` (IPA artifact generated)
- Android production build finished: `3c84ffe0-aa34-444e-8f52-cc43bef37bd4` (AAB artifact generated)
- iOS EAS submission scheduled to App Store Connect: `25b4cdb9-7d8a-4b4a-af49-8dcf53994ff0` (processing status depends on Apple)
- EAS submit scheduling did not result in an Apple-visible build for this run; manual Transporter upload of the IPA was used as fallback and succeeded
- App Store Connect / TestFlight now shows iOS build `1.0.0 (2)` upload complete and processed (`Ready to Submit`), but app sign-in fails because the build was compiled with placeholder Supabase config (missing EAS production env vars)

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main` and all PRs:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. Build shared package
6. Build admin app

Mobile store builds/submissions are run manually via Expo EAS from `apps/mobile/` and are not part of GitHub Actions CI.
