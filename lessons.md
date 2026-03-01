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
