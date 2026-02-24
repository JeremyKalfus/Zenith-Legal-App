# Product Requirements Document

## Product Overview

Zenith Legal is a legal recruiting platform connecting job-seeking lawyers (candidates) with law firms through a recruiter-mediated workflow. The platform consists of a mobile app for candidates and staff, and a web admin dashboard for recruiter operations.

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
- Role-based routing: candidate tabs vs staff tabs after sign-in.

### Candidate Intake and Onboarding
- Multi-field intake form: name, email, mobile, preferred cities (14 options + Other), practice area (16 options + Other), privacy policy consent, communication consent.
- Intake data persisted via `create_or_update_candidate_profile` edge function.
- Onboarding-complete flag gates access to main app screens.

### Firm Assignments
- Staff assigns firms to candidates via `assign_firm_to_candidate`.
- Candidates see assigned firms on their dashboard.
- Candidates authorize or decline firm submissions via `authorize_firm_submission`.
- Staff updates assignment status via `staff_update_assignment_status`.
- Staff can unassign firms via `staff_unassign_firm_from_candidate`.

### Messaging
- Stream Chat integration for real-time messaging.
- One deterministic channel per candidate: `candidate-<user_id>`.
- `chat_auth_bootstrap` edge function provisions Stream tokens and channels.
- `process_chat_webhook` handles inbound webhook events from Stream.

### Appointments
- Candidates request appointments with title, description, modality (virtual/in-person), location, video URL, start/end times, timezone.
- Appointment requests start in `pending` status.
- Staff reviews and accepts or declines via `staff_review_appointment`.
- Overlap detection prevents conflicting accepted appointments.
- Real-time subscription updates appointment list.

### Profile Management
- Candidates update email, password, and intake fields.
- Profile data stored in `users_profile` and `candidate_preferences` tables.

### Notifications
- Push token registration.
- Notification preferences per user.
- `dispatch_notifications` edge function processes queued notification deliveries.
- Notification events: appointment created/updated, assignment status change, message received.

### Admin Dashboard (web)
- Staff login via Supabase auth.
- Operations dashboard with candidate management.
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
