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
