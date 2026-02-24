create extension if not exists btree_gist;

alter type public.appointment_status add value if not exists 'pending';
alter type public.appointment_status add value if not exists 'accepted';
alter type public.appointment_status add value if not exists 'declined';
alter type public.appointment_status add value if not exists 'cancelled';

alter table public.appointments
  alter column status set default 'pending';

do $$
begin
  if exists (
    select 1
    from pg_enum
    where enumtypid = 'public.appointment_status'::regtype
      and enumlabel = 'scheduled'
  ) then
    update public.appointments
    set status = 'accepted'
    where status::text = 'scheduled';
  end if;
end
$$;

-- Preflight overlap check before enforcing the accepted-only exclusion constraint.
-- If this raises, resolve the overlapping accepted appointments first and re-run.
do $$
begin
  if exists (
    select 1
    from public.appointments a1
    join public.appointments a2
      on a1.candidate_user_id = a2.candidate_user_id
     and a1.id < a2.id
     and a1.status = 'accepted'
     and a2.status = 'accepted'
     and tstzrange(a1.start_at_utc, a1.end_at_utc, '[)')
         && tstzrange(a2.start_at_utc, a2.end_at_utc, '[)')
  ) then
    raise exception 'Cannot apply appointment accepted-overlap constraint: overlapping accepted appointments exist';
  end if;
end
$$;

drop policy if exists "appointments_create_self_or_staff" on public.appointments;

create policy "appointments_create_self_or_staff"
on public.appointments
for insert
with check (candidate_user_id = auth.uid() and created_by_user_id = auth.uid());

alter table public.appointments
  drop constraint if exists appointments_no_overlapping_accepted_per_candidate;

alter table public.appointments
  add constraint appointments_no_overlapping_accepted_per_candidate
    exclude using gist (
      candidate_user_id with =,
      tstzrange(start_at_utc, end_at_utc, '[)') with &&
    )
    where (status = 'accepted');
