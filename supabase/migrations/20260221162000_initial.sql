create extension if not exists pgcrypto;

create type public.user_role as enum ('candidate', 'staff');
create type public.practice_area as enum (
  'Antitrust',
  'Regulatory / White Collar',
  'Labor & Employment',
  'General Litigation',
  'Corporate: M&A/PE',
  'Corporate: Finance',
  'Real Estate',
  'Tax & Benefits',
  'Other'
);
create type public.firm_status as enum (
  'Waiting on your authorization to contact/submit',
  'Submitted, waiting to hear from firm',
  'Interview Stage',
  'Rejected by firm',
  'Offer received!'
);
create type public.authorization_decision as enum ('authorized', 'declined');
create type public.appointment_modality as enum ('virtual', 'in_person');
create type public.appointment_status as enum ('scheduled', 'cancelled');
create type public.calendar_provider as enum ('google', 'microsoft');
create type public.notification_channel as enum ('push', 'email');
create type public.support_request_type as enum ('export', 'delete');
create type public.support_request_status as enum ('open', 'in_progress', 'completed', 'rejected');

create table public.users_profile (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'candidate',
  name text not null,
  email text not null,
  mobile text not null,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.candidate_preferences (
  user_id uuid primary key references public.users_profile (id) on delete cascade,
  cities text[] not null default '{}',
  other_city_text text,
  practice_area public.practice_area not null,
  other_practice_text text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.recruiter_contact_config (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  email text not null,
  is_active boolean not null default true,
  updated_by uuid references public.users_profile (id),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (normalized_name)
);

create table public.candidate_firm_assignments (
  id uuid primary key default gen_random_uuid(),
  candidate_user_id uuid not null references public.users_profile (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  status_enum public.firm_status not null default 'Waiting on your authorization to contact/submit',
  status_updated_at timestamptz not null default timezone('utc', now()),
  assigned_by uuid references public.users_profile (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (candidate_user_id, firm_id)
);

create table public.candidate_authorizations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.candidate_firm_assignments (id) on delete cascade,
  decision public.authorization_decision not null,
  decided_at timestamptz not null default timezone('utc', now()),
  decided_by_candidate uuid not null references public.users_profile (id),
  created_at timestamptz not null default timezone('utc', now()),
  unique (assignment_id)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  candidate_user_id uuid not null references public.users_profile (id) on delete cascade,
  created_by_user_id uuid not null references public.users_profile (id) on delete set null,
  title text not null,
  description text,
  modality public.appointment_modality not null,
  location_text text,
  video_url text,
  start_at_utc timestamptz not null,
  end_at_utc timestamptz not null,
  timezone_label text not null,
  status public.appointment_status not null default 'scheduled',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_at_utc > start_at_utc)
);

create table public.appointment_participants (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  user_id uuid not null references public.users_profile (id) on delete cascade,
  participant_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (appointment_id, user_id)
);

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile (id) on delete cascade,
  provider public.calendar_provider not null,
  oauth_tokens_encrypted text not null,
  sync_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, provider)
);

create table public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  provider public.calendar_provider not null,
  provider_event_id text not null,
  sync_hash text not null,
  last_sync_at timestamptz not null default timezone('utc', now()),
  unique (appointment_id, provider)
);

create table public.notification_preferences (
  user_id uuid primary key references public.users_profile (id) on delete cascade,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  category_toggles_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile (id) on delete cascade,
  expo_push_token text not null,
  device_platform text not null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, expo_push_token)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users_profile (id),
  channel public.notification_channel not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users_profile (id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_json jsonb,
  after_json jsonb,
  ip_hash text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.support_data_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid references public.users_profile (id),
  request_type public.support_request_type not null,
  status public.support_request_status not null default 'open',
  handled_by_staff uuid references public.users_profile (id),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_candidate_assignments_candidate on public.candidate_firm_assignments(candidate_user_id);
create index idx_candidate_assignments_status on public.candidate_firm_assignments(status_enum);
create index idx_appointments_candidate on public.appointments(candidate_user_id, start_at_utc);
create index idx_audit_events_created_at on public.audit_events(created_at desc);
create index idx_notification_deliveries_user_created on public.notification_deliveries(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users_profile up
    where up.id = auth.uid() and up.role = 'staff'
  );
$$;

create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
end;
$$;

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('insert', tg_table_name, coalesce(new.id::text, ''), null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('update', tg_table_name, coalesce(new.id::text, ''), to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('delete', tg_table_name, coalesce(old.id::text, ''), to_jsonb(old), null);
    return old;
  end if;

  return null;
end;
$$;

create trigger users_profile_set_updated_at
before update on public.users_profile
for each row
execute function public.set_updated_at();

create trigger candidate_preferences_set_updated_at
before update on public.candidate_preferences
for each row
execute function public.set_updated_at();

create trigger firms_set_updated_at
before update on public.firms
for each row
execute function public.set_updated_at();

create trigger assignments_set_updated_at
before update on public.candidate_firm_assignments
for each row
execute function public.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row
execute function public.set_updated_at();

create trigger calendar_connections_set_updated_at
before update on public.calendar_connections
for each row
execute function public.set_updated_at();

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row
execute function public.set_updated_at();

create trigger support_data_requests_set_updated_at
before update on public.support_data_requests
for each row
execute function public.set_updated_at();

create trigger assignments_audit_trigger
after insert or update or delete on public.candidate_firm_assignments
for each row execute function public.audit_trigger();

create trigger appointments_audit_trigger
after insert or update or delete on public.appointments
for each row execute function public.audit_trigger();

create trigger support_data_requests_audit_trigger
after insert or update or delete on public.support_data_requests
for each row execute function public.audit_trigger();

alter table public.users_profile enable row level security;
alter table public.candidate_preferences enable row level security;
alter table public.recruiter_contact_config enable row level security;
alter table public.firms enable row level security;
alter table public.candidate_firm_assignments enable row level security;
alter table public.candidate_authorizations enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_participants enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_event_links enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.audit_events enable row level security;
alter table public.support_data_requests enable row level security;

create policy "users_profile_self_or_staff_select"
on public.users_profile
for select
using (id = auth.uid() or public.is_staff());

create policy "users_profile_self_or_staff_update"
on public.users_profile
for update
using (id = auth.uid() or public.is_staff())
with check (id = auth.uid() or public.is_staff());

create policy "users_profile_insert_self_or_staff"
on public.users_profile
for insert
with check (id = auth.uid() or public.is_staff());

create policy "candidate_preferences_self_or_staff"
on public.candidate_preferences
for all
using (user_id = auth.uid() or public.is_staff())
with check (user_id = auth.uid() or public.is_staff());

create policy "recruiter_contact_read_all"
on public.recruiter_contact_config
for select
using (auth.role() = 'authenticated');

create policy "recruiter_contact_staff_write"
on public.recruiter_contact_config
for all
using (public.is_staff())
with check (public.is_staff());

create policy "firms_read_authenticated"
on public.firms
for select
using (auth.role() = 'authenticated');

create policy "firms_staff_write"
on public.firms
for all
using (public.is_staff())
with check (public.is_staff());

create policy "assignment_candidate_read"
on public.candidate_firm_assignments
for select
using (candidate_user_id = auth.uid() or public.is_staff());

create policy "assignment_staff_write"
on public.candidate_firm_assignments
for all
using (public.is_staff())
with check (public.is_staff());

create policy "authorizations_candidate_insert"
on public.candidate_authorizations
for insert
with check (
  decided_by_candidate = auth.uid()
  and exists (
    select 1
    from public.candidate_firm_assignments cfa
    where cfa.id = assignment_id
      and cfa.candidate_user_id = auth.uid()
  )
);

create policy "authorizations_self_or_staff_select"
on public.candidate_authorizations
for select
using (
  public.is_staff() or exists (
    select 1
    from public.candidate_firm_assignments cfa
    where cfa.id = assignment_id
      and cfa.candidate_user_id = auth.uid()
  )
);

create policy "appointments_self_or_staff"
on public.appointments
for select
using (candidate_user_id = auth.uid() or created_by_user_id = auth.uid() or public.is_staff());

create policy "appointments_create_self_or_staff"
on public.appointments
for insert
with check (candidate_user_id = auth.uid() or created_by_user_id = auth.uid() or public.is_staff());

create policy "appointments_update_self_or_staff"
on public.appointments
for update
using (candidate_user_id = auth.uid() or created_by_user_id = auth.uid() or public.is_staff())
with check (candidate_user_id = auth.uid() or created_by_user_id = auth.uid() or public.is_staff());

create policy "appointment_participants_self_or_staff"
on public.appointment_participants
for all
using (user_id = auth.uid() or public.is_staff())
with check (user_id = auth.uid() or public.is_staff());

create policy "calendar_connections_self_or_staff"
on public.calendar_connections
for all
using (user_id = auth.uid() or public.is_staff())
with check (user_id = auth.uid() or public.is_staff());

create policy "calendar_event_links_self_or_staff"
on public.calendar_event_links
for all
using (
  public.is_staff() or exists (
    select 1
    from public.appointments a
    where a.id = appointment_id
      and (a.candidate_user_id = auth.uid() or a.created_by_user_id = auth.uid())
  )
)
with check (
  public.is_staff() or exists (
    select 1
    from public.appointments a
    where a.id = appointment_id
      and (a.candidate_user_id = auth.uid() or a.created_by_user_id = auth.uid())
  )
);

create policy "notification_preferences_self_or_staff"
on public.notification_preferences
for all
using (user_id = auth.uid() or public.is_staff())
with check (user_id = auth.uid() or public.is_staff());

create policy "push_tokens_self_or_staff"
on public.push_tokens
for all
using (user_id = auth.uid() or public.is_staff())
with check (user_id = auth.uid() or public.is_staff());

create policy "notification_deliveries_self_or_staff"
on public.notification_deliveries
for select
using (user_id = auth.uid() or public.is_staff());

create policy "notification_deliveries_staff_insert"
on public.notification_deliveries
for insert
with check (public.is_staff());

create policy "audit_staff_only"
on public.audit_events
for select
using (public.is_staff());

create policy "support_requests_staff_only"
on public.support_data_requests
for all
using (public.is_staff())
with check (public.is_staff());

insert into public.recruiter_contact_config (id, phone, email, is_active)
values ('00000000-0000-0000-0000-000000000001', '+12025550123', 'recruiting@zenithlegal.com', true)
on conflict (id) do nothing;
