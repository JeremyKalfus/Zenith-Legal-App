create table public.candidate_recruiter_assignments (
  candidate_user_id uuid primary key references public.users_profile (id) on delete cascade,
  recruiter_user_id uuid references public.users_profile (id) on delete set null,
  updated_by uuid references public.users_profile (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_candidate_recruiter_assignments_recruiter
on public.candidate_recruiter_assignments (recruiter_user_id);

create trigger candidate_recruiter_assignments_set_updated_at
before update on public.candidate_recruiter_assignments
for each row
execute function public.set_updated_at();

create trigger candidate_recruiter_assignments_audit_trigger
after insert or update or delete on public.candidate_recruiter_assignments
for each row execute function public.audit_trigger();

alter table public.candidate_recruiter_assignments enable row level security;

create policy "candidate_recruiter_assignments_staff_select"
on public.candidate_recruiter_assignments
for select
using (public.is_staff());

create policy "candidate_recruiter_assignments_staff_write"
on public.candidate_recruiter_assignments
for all
using (public.is_staff())
with check (public.is_staff());
