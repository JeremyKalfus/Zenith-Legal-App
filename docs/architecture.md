# Architecture Overview

## Mobile

- Auth shell routes into candidate tabs or staff tabs by `users_profile.role`.
- Candidate tabs: Dashboard, Messages, Appointments, Profile.
- Staff mobile tabs: Messages, Appointments.
- Stream chat channel model: one deterministic `candidate-<id>` channel.

## Admin

- Recruiter/staff login via Supabase magic link.
- Modules:
  - Candidate directory
  - Firm master + bulk paste ingest
  - Manual assignment manager
  - Status update console
  - Appointment + calendar health
  - Recruiter contact settings
  - Audit log view
  - Support data request queue

## Backend

- Supabase Postgres schema with strict RLS.
- Staff-only mutations routed via edge functions.
- Audit events persisted for privileged workflows.
- Notification dispatch paths persisted in `notification_deliveries`.
