alter table public.candidate_consents
  add column if not exists job_opportunity_push_accepted boolean not null default false,
  add column if not exists job_opportunity_push_accepted_at timestamptz,
  add column if not exists job_opportunity_push_version text;

update public.candidate_consents
set
  job_opportunity_push_accepted = false,
  job_opportunity_push_accepted_at = null,
  job_opportunity_push_version = null
where job_opportunity_push_accepted is distinct from false
   or job_opportunity_push_accepted_at is not null
   or job_opportunity_push_version is not null;
