create extension if not exists btree_gist;

alter type public.appointment_status rename value 'scheduled' to 'accepted';
alter type public.appointment_status add value if not exists 'requested';
alter type public.appointment_status add value if not exists 'declined';

alter table public.appointments
  alter column status set default 'requested';

alter table public.appointments
  add constraint appointments_accepted_no_overlap_per_candidate
  exclude using gist (
    candidate_user_id with =,
    tstzrange(start_at_utc, end_at_utc, '[)') with &&
  )
  where (status = 'accepted');

alter publication supabase_realtime add table if not exists public.appointments;
