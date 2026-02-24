do $$
begin
  if exists (
    select 1
    from pg_enum
    where enumtypid = 'public.practice_area'::regtype
      and enumlabel = 'Regulatory / White Collar'
  ) then
    alter type public.practice_area rename value 'Regulatory / White Collar' to 'White Collar';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_enum
    where enumtypid = 'public.practice_area'::regtype
      and enumlabel = 'General Litigation'
  ) then
    alter type public.practice_area rename value 'General Litigation' to 'Litigation';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_enum
    where enumtypid = 'public.practice_area'::regtype
      and enumlabel = 'Corporate: M&A/PE'
  ) then
    alter type public.practice_area rename value 'Corporate: M&A/PE' to 'Corp: M&A/PE';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_enum
    where enumtypid = 'public.practice_area'::regtype
      and enumlabel = 'Corporate: Finance'
  ) then
    alter type public.practice_area rename value 'Corporate: Finance' to 'Corp: Finance';
  end if;
end
$$;

alter type public.practice_area add value if not exists 'Int''l arb' after 'White Collar';
alter type public.practice_area add value if not exists 'Int''l reg' after 'Int''l arb';
alter type public.practice_area add value if not exists 'Gov Contracts' after 'Int''l reg';
alter type public.practice_area add value if not exists 'SEC / CFTC' after 'Gov Contracts';
alter type public.practice_area add value if not exists 'IP / Tech Trans' after 'SEC / CFTC';
alter type public.practice_area add value if not exists 'Corp: EC/VC' after 'Corp: Finance';
alter type public.practice_area add value if not exists 'Corp: Cap Mkts' after 'Corp: EC/VC';
