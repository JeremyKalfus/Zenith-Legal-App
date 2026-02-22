do $$
begin
  if exists (
    select 1
    from public.users_profile
    group by mobile
    having count(*) > 1
  ) then
    raise exception 'Duplicate mobile values exist in users_profile; resolve before applying unique index';
  end if;

  if exists (
    select 1
    from public.users_profile
    group by lower(email)
    having count(*) > 1
  ) then
    raise exception 'Duplicate email values (case-insensitive) exist in users_profile; resolve before applying unique index';
  end if;
end
$$;

create unique index if not exists users_profile_mobile_unique_idx
  on public.users_profile (mobile);

create unique index if not exists users_profile_email_lower_unique_idx
  on public.users_profile (lower(email));
