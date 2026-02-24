# Execution Plans

## Current Milestone Status

- [x] Monorepo scaffolding and CI baseline
- [x] Shared domain contracts and validation schemas
- [x] Supabase initial schema + RLS + edge function contracts
- [x] Mobile role-based navigation skeleton and core screens
- [x] Admin operations dashboard skeleton
- [x] Edge function auth fix (getUser with explicit JWT + verify_jwt=false)
- [x] Appointment creation and viewing for candidates
- [x] Staff appointment review workflow (pending/accepted/declined, edge function, mobile + admin UI)
- [x] Admin appointment management (accept/decline in dashboard)
- [x] Error handling standardization (shared `getFunctionErrorMessage` utility)
- [x] Test coverage expansion (41 tests across 6 files)
- [ ] Vendor credential wiring for end-to-end runtime (requires secrets)
- [ ] Device-level release signing and EAS submit credentials

## Prioritized Work Queue

### High Priority

1. **Notification dispatch implementation** -- `dispatch_notifications` edge function exists; push/email delivery channels need vendor integration (requires secrets).
2. **Calendar sync implementation** -- `connect_calendar_provider` edge function and schema tables exist; OAuth flows and event sync logic need completion.

### Medium Priority

3. **Observability wiring** -- Sentry DSN and PostHog key integration points are defined but not connected.
4. **Staff mobile messaging** -- `staff-messages-screen.tsx` exists but needs Stream Chat integration matching the candidate flow.
5. **Admin README** -- Replace default Next.js boilerplate README with project-specific documentation.

## Blockers and Dependencies

- **Vendor secrets required** for: Stream Chat (messaging runtime), notification dispatch (push/email providers), calendar OAuth (Google/Microsoft client IDs), Sentry, PostHog.
- **EAS credentials required** for: iOS TestFlight and Android Play Internal Testing builds.
- **Staging Supabase project** needed before promoting beyond dev.

## Next 3 Tasks

### 1. Wire notification dispatch (requires vendor secrets)

**Scope:** Implement the notification processor in `dispatch_notifications` that reads `notification_deliveries` with `status = 'queued'` and sends via Expo Push API (push) or email provider (email).

**Verification:**
- Push notifications delivered to candidate devices.
- Email notifications sent for appointment events.
- `notification_deliveries.status` updated to `'sent'` or `'failed'`.

### 2. Wire calendar sync

**Scope:** Complete `connect_calendar_provider` with OAuth token exchange for Google/Microsoft calendars and implement appointment-to-event sync.

**Verification:**
- Calendar connection persists OAuth tokens.
- Accepted appointments appear in connected calendars.
- `npm run verify` passes.

### 3. Staff mobile messaging

**Scope:** Wire `staff-messages-screen.tsx` to Stream Chat with the same pattern as the candidate messaging flow.

**Verification:**
- Staff can send and receive messages.
- Stream Chat token provisioned via `chat_auth_bootstrap`.
- `npm run lint` and `npm run typecheck` pass.
