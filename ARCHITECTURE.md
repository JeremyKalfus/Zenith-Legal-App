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
| Mobile | `apps/mobile/` | Expo SDK 54, React Native 0.81, React Navigation, react-hook-form, Zod, Stream Chat RN | Candidate and staff mobile app |
| Admin | `apps/admin/` | Next.js 16, React 19, Tailwind 4, shadcn primitives, Zod | Recruiter web dashboard |
| Shared | `packages/shared/` | TypeScript, Zod | Domain types, validation schemas, phone utilities |
| Backend | `supabase/` | PostgreSQL 15, Deno edge functions, `@supabase/supabase-js@2.57.4` | Database, auth, serverless API |

## Edge Functions

All edge functions live under `supabase/functions/` and share utilities from `_shared/` (HTTP helpers, Supabase client factories, audit logging).

| Function | Auth | Purpose |
|---|---|---|
| `register_candidate_password` | Public | Candidate registration |
| `mobile_sign_in_with_identifier_password` | Public | Password sign-in |
| `create_or_update_candidate_profile` | User JWT | Intake profile upsert |
| `schedule_or_update_appointment` | User JWT | Appointment CRUD |
| `authorize_firm_submission` | User JWT | Candidate authorizes/declines firm |
| `chat_auth_bootstrap` | User JWT | Provisions Stream Chat token and channel |
| `connect_calendar_provider` | User JWT | Calendar OAuth connection |
| `staff_review_appointment` | Staff JWT | Accept/decline appointment requests (pending -> accepted/declined with overlap detection) |
| `assign_firm_to_candidate` | Staff JWT | Assign firm to candidate |
| `staff_update_assignment_status` | Staff JWT | Update assignment status |
| `staff_unassign_firm_from_candidate` | Staff JWT | Remove firm assignment |
| `bulk_paste_ingest_firms` | Staff JWT | Bulk firm data import |
| `staff_handle_data_request` | Staff JWT | Process support/data requests |
| `dispatch_notifications` | Internal | Process notification queue |
| `process_chat_webhook` | Webhook signature | Handle Stream Chat events |

**JWT handling:** All functions set `verify_jwt = false` in `supabase/config.toml` to bypass gateway-level JWT verification (required due to the project's JWT signing key format). Auth is enforced internally via `getCurrentUserId()` which extracts the Bearer token and calls `getUser(token)`.

## Database Schema

9 migrations in `supabase/migrations/`. Key tables:

- `users_profile` -- User identity and role (candidate/staff)
- `candidate_preferences` -- Cities, practice area
- `candidate_consents` -- Privacy and communication consents with versioning
- `firms` -- Law firm directory
- `candidate_firm_assignments` -- Staff-managed candidate-to-firm assignments
- `candidate_authorizations` -- Candidate decisions on firm submissions
- `appointments` / `appointment_participants` -- Scheduling with overlap constraints
- `calendar_connections` / `calendar_event_links` -- External calendar sync
- `notification_preferences` / `push_tokens` / `notification_deliveries` -- Notification pipeline
- `audit_events` -- Immutable audit log
- `support_data_requests` -- Candidate support requests
- `recruiter_contact_config` -- Configurable recruiter phone/email for mobile banner

All tables enforce Row Level Security. Staff-only mutations are routed through edge functions that call `assertStaff()`.

## Auth Flows

- **Password**: `register_candidate_password` creates user + profile; `mobile_sign_in_with_identifier_password` signs in.
- **Magic link**: Supabase built-in email magic link (used for staff).
- **SMS OTP**: Supabase built-in phone OTP.
- **Session management**: Expo SecureStore (mobile) or localStorage (web) for token persistence. `autoRefreshToken: true` enabled. Client-side `ensureValidSession()` helper proactively refreshes tokens nearing expiry.

## Secrets and Configuration

See `docs/secrets.md` for the full inventory. Secrets are provided via:

- `.env` files locally (excluded from git via `.gitignore`)
- GitHub Actions secrets for CI
- EAS secrets for mobile builds
- Vercel environment variables for admin deploys
- Supabase dashboard for edge function environment variables

Required environment variables (placeholders):

```
SUPABASE_URL=<project-url>
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
STREAM_API_KEY=<stream-key>
STREAM_API_SECRET=<stream-secret>
```

## Environments

See `docs/release.md` for full environment strategy.

| Environment | Purpose | Supabase | Admin Deploy |
|---|---|---|---|
| dev | Local development | Local or hosted project | `npm run dev:admin` |
| staging | QA and UAT | Dedicated project | Vercel preview |
| prod | Production release | Dedicated project | Vercel production |

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main` and all PRs:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. Build shared package
6. Build admin app
