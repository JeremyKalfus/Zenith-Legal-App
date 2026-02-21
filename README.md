# Zenith Legal App Monorepo

Production-oriented monorepo for Zenith Legal mobile + admin platform.

## Workspace Layout

- `apps/mobile`: Expo React Native app (candidate + staff role UX)
- `apps/admin`: Next.js recruiter dashboard (staff operations)
- `packages/shared`: shared domain enums and validation schemas
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

## Milestone Status

- [x] Monorepo scaffolding and CI baseline
- [x] Shared domain contracts and validation schemas
- [x] Supabase initial schema + RLS + edge function contracts
- [x] Mobile role-based navigation skeleton and core screens
- [x] Admin operations dashboard skeleton
- [ ] Vendor credential wiring for end-to-end runtime (requires secrets)
- [ ] Device-level release signing and EAS submit credentials

## Git Workflow

- Branch from `main` using `codex/<feature-name>`.
- Run `npm run verify` before each commit.
- Keep commits scoped to a single deliverable increment.
