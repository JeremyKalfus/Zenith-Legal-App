create table public.candidate_consents (
  user_id uuid primary key references public.users_profile (id) on delete cascade,
  privacy_policy_accepted boolean not null default false,
  privacy_policy_accepted_at timestamptz,
  privacy_policy_version text,
  communication_consent_accepted boolean not null default false,
  communication_consent_accepted_at timestamptz,
  communication_consent_version text,
  source text not null default 'mobile_app',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (not privacy_policy_accepted and privacy_policy_accepted_at is null and privacy_policy_version is null)
    or privacy_policy_accepted
  ),
  check (
    (not communication_consent_accepted and communication_consent_accepted_at is null and communication_consent_version is null)
    or communication_consent_accepted
  )
);

create trigger candidate_consents_set_updated_at
before update on public.candidate_consents
for each row
execute function public.set_updated_at();

create trigger candidate_consents_audit_trigger
after insert or update or delete on public.candidate_consents
for each row execute function public.audit_trigger();

alter table public.candidate_consents enable row level security;

create policy "candidate_consents_self_or_staff"
on public.candidate_consents
for all
using (user_id = auth.uid() or public.is_staff())
with check (user_id = auth.uid() or public.is_staff());
