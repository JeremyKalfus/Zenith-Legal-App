# Supabase Module

This folder contains SQL migrations and edge functions for Zenith Legal.

## Local development

1. Install Supabase CLI.
2. Start local stack: `supabase start`
3. Apply migrations: `supabase db push`
4. Run functions locally: `supabase functions serve`

## Implemented contracts

- `create_or_update_candidate_profile`
- `authorize_firm_submission`
- `staff_update_assignment_status`
- `bulk_paste_ingest_firms`
- `assign_firm_to_candidate`
- `schedule_or_update_appointment`
- `connect_calendar_provider`
- `process_chat_webhook`
- `dispatch_notifications` (refactored into focused helpers: `fetchTokensByUser`, `processSingleDelivery`, `revokeStaleTokens`)
- `staff_handle_data_request`
- `chat_auth_bootstrap`
