# Zenith Legal App Monorepo

Production-oriented monorepo for Zenith Legal mobile + admin platform (candidate app, staff app flows, and admin web dashboard).

## Workspace Layout

- `apps/mobile`: Expo React Native app (candidate + staff role UX)
- `apps/admin`: Next.js recruiter dashboard (staff operations)
- `apps/privacy-policy`: static public privacy policy website (Vercel-ready)
- `packages/shared`: shared domain types, validation schemas, phone utilities, staff-messaging helpers, and candidate filtering helpers
- `supabase`: database migrations, RLS policies, edge functions
- `docs`: architecture, release, and operations notes

## Stack

- Mobile: Expo + TypeScript + React Navigation + react-hook-form + zod + Stream Chat
- Backend: Supabase Auth/Postgres/RLS/Edge Functions
- Admin: Next.js + TypeScript + Tailwind + shadcn-style primitives
- Observability hooks: Sentry/PostHog integration points defined

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Configure environment files

- Copy `apps/mobile/.env.example` -> `apps/mobile/.env`
- Copy `apps/admin/.env.example` -> `apps/admin/.env.local`
- Fill vendor secrets for Supabase/Stream/etc.

3. Start apps

```bash
npm run dev:mobile
npm run dev:admin
```

4. Run full verification gates

```bash
npm run verify
```

### Root Scripts

- `npm run dev:mobile`: starts Expo mobile app
- `npm run dev:admin`: starts Next.js admin app
- `npm run dev`: alias for `dev:mobile`
- `npm run build`: builds all workspaces that define `build`
- `npm run lint`: runs lint checks across all workspaces
- `npm run typecheck`: runs TypeScript checks across all workspaces
- `npm run test`: runs tests across all workspaces
- `npm run verify`: runs `lint`, `typecheck`, and `test` in sequence

## Supabase Reality Check (2026-03-06)

- Linked project: `njxgoypivrxyrukpouxb` (`ZL App`, West US/Oregon).
- Migration parity is clean: local and hosted include all migrations through `20260306130500`.
- Function parity is not yet clean: local has 21 function directories (excluding `_shared`), hosted has 20 active functions.
- Missing hosted function slug: `staff_send_job_opportunity_notification`.

Recommended parity commands:

```bash
supabase migration list
supabase functions list
```

5. Run code quality scan (optional)

```bash
# Install desloppify (one-time)
python3 -m pip install --break-system-packages "desloppify[full]"

# Scan the full codebase
python3 -m desloppify scan --path .

# View prioritized issues
python3 -m desloppify next --count 10

# See the full plan
python3 -m desloppify plan
```

## Milestone Status

- [x] Monorepo scaffolding and CI baseline
- [x] Shared domain contracts and validation schemas
- [x] Supabase initial schema + RLS + edge function contracts
- [x] Mobile role-based navigation skeleton and core screens
- [x] Admin operations dashboard skeleton
- [x] Staff/candidate messaging (Stream Chat; inbox-first staff flows on mobile + admin web)
- [x] Candidate firm authorization workflow (decline-delete for waiting assignments; cancel for authorized assignments)
- [x] Candidate/staff and admin account deletion flows (mobile self-service + admin candidate/staff delete with self/last-staff safeguards)
- [x] Push notification queue processing via Expo Push API (`dispatch_notifications` processor mode)
- [x] Candidate job-opportunity push opt-in + recruiter mobile bulk-send flow in code/schema
- [x] Staff messaging auth hardening and channel-watch readiness fixes (admin + mobile)
- [x] Code quality pass: consolidated duplicates into shared package, centralized mobile theme, extracted custom hooks, refactored edge functions
- [ ] Vendor credential wiring for end-to-end runtime (requires secrets)
- [ ] Hosted Supabase function parity (`staff_send_job_opportunity_notification` deployment)
- [ ] Notification email provider + scheduled dispatch automation (push processor is implemented; automation still pending)
- [x] Device-level release signing baseline (EAS Android keystore + iOS distribution certificate/provisioning profile + iOS APNs/App Store Connect API key)
- [ ] Android `eas submit` credential setup (Google Play service account)
- [ ] EAS production runtime env vars configured and validated in store builds

## Git Workflow

- Branch from `main` using `codex/<feature-name>`.
- Run `npm run verify` before each commit.
- Keep commits scoped to a single deliverable increment.
