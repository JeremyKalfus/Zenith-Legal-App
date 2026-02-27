create table public.candidate_recruiter_contact_overrides (
  candidate_user_id uuid primary key references public.users_profile (id) on delete cascade,
  phone text not null,
  email text not null,
  updated_by uuid references public.users_profile (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_id text;
begin
  if tg_op = 'INSERT' then
    entity_id := coalesce(
      to_jsonb(new) ->> 'id',
      to_jsonb(new) ->> 'user_id',
      to_jsonb(new) ->> 'candidate_user_id',
      ''
    );
    perform public.log_audit_event('insert', tg_table_name, entity_id, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    entity_id := coalesce(
      to_jsonb(new) ->> 'id',
      to_jsonb(new) ->> 'user_id',
      to_jsonb(new) ->> 'candidate_user_id',
      ''
    );
    perform public.log_audit_event('update', tg_table_name, entity_id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    entity_id := coalesce(
      to_jsonb(old) ->> 'id',
      to_jsonb(old) ->> 'user_id',
      to_jsonb(old) ->> 'candidate_user_id',
      ''
    );
    perform public.log_audit_event('delete', tg_table_name, entity_id, to_jsonb(old), null);
    return old;
  end if;

  return null;
end;
$$;

create trigger candidate_recruiter_contact_overrides_set_updated_at
before update on public.candidate_recruiter_contact_overrides
for each row
execute function public.set_updated_at();

create trigger candidate_recruiter_contact_overrides_audit_trigger
after insert or update or delete on public.candidate_recruiter_contact_overrides
for each row execute function public.audit_trigger();

alter table public.candidate_recruiter_contact_overrides enable row level security;

create policy "candidate_contact_overrides_self_or_staff_select"
on public.candidate_recruiter_contact_overrides
for select
using (candidate_user_id = auth.uid() or public.is_staff());

create policy "candidate_contact_overrides_staff_write"
on public.candidate_recruiter_contact_overrides
for all
using (public.is_staff())
with check (public.is_staff());
