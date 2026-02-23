-- Allow candidate sign-up/profile optional fields to be stored as NULL.
-- Drop NOT NULL first, then normalize blank strings so application logic can rely on NULL.

alter table public.users_profile
  alter column name drop not null,
  alter column mobile drop not null;

alter table public.candidate_preferences
  alter column practice_area drop not null;

update public.users_profile
set name = null
where btrim(name) = '';

update public.users_profile
set mobile = null
where btrim(mobile) = '';
