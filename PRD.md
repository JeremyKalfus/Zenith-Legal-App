# Product Requirements Document

## Product Overview

Zenith Legal is a legal recruiting platform connecting job-seeking lawyers (candidates) with law firms through a recruiter-mediated workflow. The platform consists of a mobile app for candidates and staff, and a web admin dashboard for recruiter operations.

### Distribution Readiness (Operational Snapshot: 2026-02-25)

- Mobile production identifiers are set to `com.zenithlegal.app` for both iOS and Android.
- Apple Developer App ID and App Store Connect app record (`Zenith Legal`) are created for the production iOS app.
- Expo EAS project is linked for standalone store builds (`@jeremykalfus/zenith-legal-mobile`).
- EAS-managed Android signing keystore, iOS distribution certificate/provisioning profile, iOS APNs key, and iOS App Store Connect submit API key are configured.
- Initial production EAS builds have completed for iOS/TestFlight and Android/Play internal testing artifacts (IPA + AAB).
- iOS EAS submission to App Store Connect has been scheduled; Google Play submit credential setup remains pending.

## User Roles

### Candidate (job-seeking lawyer)
- Registers via email/password, completes an intake profile (name, email, mobile, preferred cities, practice area, privacy/communication consents).
- Views a dashboard of law firms they have been assigned to by staff.
- Authorizes or declines firm submissions (recruiter submitting their resume to a firm).
- Messages the recruiter team via real-time chat.
- Requests and views appointments with the recruiter.
- Manages their profile (email, password, intake fields).

### Staff (recruiter)
- Signs in via invite-only magic link.
- Manages candidate-firm assignments: assigns firms to candidates, updates assignment statuses, unassigns firms.
- Reviews appointment requests (accept/decline).
- Messages candidates via real-time chat.
- Ingests firm data in bulk (paste-based).
- Handles support/data requests from candidates.

## Confirmed Features (observed in code)

### Authentication
- Email/password registration and sign-in (custom edge functions: `register_candidate_password`, `mobile_sign_in_with_identifier_password`).
- Email magic link sign-in.
- SMS OTP verification.
- Password reset flow.
- Invalid or revoked persisted sessions are cleared on app startup (users are returned to sign-in instead of hitting a startup auth refresh error loop).
- Role-based routing: candidate tabs vs staff tabs after sign-in.

### Candidate Intake and Onboarding
- Multi-field intake form: name, email, mobile, preferred cities (14 options + Other), practice areas (0–3 of 16 options + Other), privacy policy consent, communication consent.
- Intake data persisted via `create_or_update_candidate_profile` edge function.
- Onboarding-complete flag gates access to main app screens.

### Firm Assignments
- Staff assigns firms to candidates via `assign_firm_to_candidate`.
- Candidates see assigned firms on their dashboard.
- Candidates authorize firm submissions via `authorize_firm_submission`.
- Candidates declining while status is `Waiting on your authorization to contact/submit` removes that firm assignment from the dashboard (assignment deleted).
- Candidates can cancel a prior authorization while status is `Authorized, will submit soon` (UI label `Cancel`; backend reverts status to waiting).
- Staff updates assignment status via `staff_update_assignment_status`.
- Staff can unassign firms via `staff_unassign_firm_from_candidate`.

### Messaging
- Stream Chat integration for real-time messaging (native: stream-chat-expo; web: stream-chat-react with CDN CSS injection).
- One deterministic channel per candidate: `candidate-<user_id>`; channel members are the candidate plus all staff.
- Staff Messages tab is inbox-first and lists existing candidate DM channels (channels with at least one message); any staff member can reply in the shared candidate channel.
- `chat_auth_bootstrap` edge function provisions Stream tokens and channel; requires an existing `users_profile` row (no auto-creation).
- `process_chat_webhook` handles inbound webhook events from Stream.
- Client calls `ensureValidSession()` before bootstrap; errors from the function are surfaced via `getFunctionErrorMessage` (response body extraction).

### Appointments
- Candidates request appointments with title, description, modality (virtual/in-person), optional location (in-person) and video URL (virtual), start/end times, timezone.
- Appointment requests start in `pending` status.
- Staff reviews and accepts or declines via `staff_review_appointment`.
- Overlap detection prevents conflicting accepted appointments.
- Real-time subscription updates appointment list.

### Profile Management
- Candidates update email, password, and intake fields.
- Profile data stored in `users_profile` and `candidate_preferences` tables.
- Candidates can delete their account in-app from Profile (self-service deletion flow with confirmation).

### Notifications
- Push token registration.
- Notification preferences per user.
- `dispatch_notifications` edge function can enqueue notification events and process queued push notification deliveries (Expo Push API).
- Automatic recurring processor scheduling is not fully wired yet (queued deliveries require processor invocation until scheduler/automation is added).
- Notification events: appointment created/updated, assignment status change, message received.
- Standalone/TestFlight iOS push notification credential setup (Apple APNs key in EAS) is configured as of 2026-02-25; runtime validation on a TestFlight build is still pending.

### Admin Dashboard (web)
- Staff login via Supabase auth.
- Operations dashboard with candidate management.
- Staff Messages page with inbox-first candidate DM channels (Stream Chat web thread view + reply).
- Candidate management includes candidate account hard delete (candidate-only scope).
- Candidate-firm assignment manager.
- Bulk firm ingest via paste.

### Audit and Compliance
- `audit_events` table records privileged operations.
- Audit trigger on database tables for insert/update/delete.
- `writeAuditEvent` utility in edge functions for explicit audit logging.
- Candidate consents tracked with version and timestamp.

### Calendar Integration
- `connect_calendar_provider` edge function (Google, Microsoft).
- `calendar_connections` and `calendar_event_links` tables in schema.

## Open Questions

- What is the intended behavior when a candidate's appointment overlaps with a pending (not yet accepted) appointment?
- Is there a workflow for staff to create appointments on behalf of candidates?
- What are the specific notification delivery channels beyond push (email, SMS)?
- How should the calendar integration sync appointments to external calendars?
- What is the support/data request lifecycle beyond the initial request creation?
- Are there plans for candidate self-service firm discovery (vs recruiter-only assignment)?
