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
- [x] Error handling standardization (shared `getFunctionErrorMessage` utility; response-body extraction via `error.context` / `Response.clone()`)
- [x] Test coverage expansion (41 tests across 6 files)
- [x] Stream messaging on web (stream-chat-react, CDN CSS, `chat_auth_bootstrap` secrets; no users_profile fallback)
- [x] Practice areas multi-select (0–3; `practice_areas` column, shared schema and edge functions updated)
- [x] Staff mobile messaging (shared candidate channels, staff inbox-first navigation, web + native)
- [x] Admin web staff messaging inbox + candidate deletion workflow (candidate-only hard delete)
- [x] Candidate dashboard authorization UX semantics (waiting decline deletes assignment; authorized decline labeled cancel)
- [x] Candidate self-service in-app account deletion flow (Profile screen + `delete_my_account` edge function)
- [x] Push notification dispatch queue processor (Expo Push API send + queued delivery status updates)
- [x] Admin web staff messaging inbox + candidate deletion workflow (candidate-only hard delete)
- [x] Candidate dashboard authorization UX semantics (waiting decline deletes assignment; authorized decline labeled cancel)
- [ ] Vendor credential wiring for end-to-end runtime (requires secrets)
- [ ] Device-level release signing and EAS submit credentials

## Prioritized Work Queue

### High Priority

1. **Notification dispatch implementation (email provider + scheduling hardening)** -- Push queue processing is implemented via Expo Push API; email delivery provider integration and production scheduling/automation still need completion.
2. **Calendar sync implementation** -- `connect_calendar_provider` edge function and schema tables exist; OAuth flows and event sync logic need completion.

### Medium Priority

3. **Observability wiring** -- Sentry DSN and PostHog key integration points are defined but not connected.
4. **Admin README** -- Replace default Next.js boilerplate README with project-specific documentation.

## Blockers and Dependencies

- **Vendor secrets required** for: notification dispatch email provider (push via Expo Push API does not require a provider secret), calendar OAuth (Google/Microsoft client IDs), Sentry, PostHog. Stream Chat (`STREAM_API_KEY`, `STREAM_API_SECRET`) are set in Supabase edge function secrets for messaging.
- **EAS credentials required** for: iOS TestFlight and Android Play Internal Testing builds.
- **Staging Supabase project** needed before promoting beyond dev.

## Next 3 Tasks

### 1. Finish notification dispatch (email provider + processor automation)

**Scope:** Complete notification dispatch by adding email delivery provider integration and wiring a scheduler/automation to invoke `dispatch_notifications` in processor mode regularly. Push queue processing via Expo Push API is implemented.

**Verification:**
- Push notifications delivered to candidate devices.
- Email notifications sent for appointment events.
- `notification_deliveries.status` updated to `'sent'` or `'failed'`.
- Processor invocation is automated on a schedule (not manual-only).

### 2. Wire calendar sync

**Scope:** Complete `connect_calendar_provider` with OAuth token exchange for Google/Microsoft calendars and implement appointment-to-event sync.

**Verification:**
- Calendar connection persists OAuth tokens.
- Accepted appointments appear in connected calendars.
- `npm run verify` passes.

### 3. Observability wiring

**Scope:** Connect Sentry DSN and PostHog key integration points in mobile/admin so errors and key product events are captured in production environments.

**Verification:**
- Runtime errors are sent to Sentry in staging/production.
- Core onboarding/appointment/messaging events are tracked in PostHog.
- `npm run verify` passes.
