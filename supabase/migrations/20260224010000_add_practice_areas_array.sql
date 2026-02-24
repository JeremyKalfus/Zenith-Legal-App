alter table public.candidate_preferences
  add column if not exists practice_areas text[] not null default '{}';

update public.candidate_preferences
set practice_areas = case
  when practice_area is null then '{}'::text[]
  else array[practice_area::text]
end
where cardinality(practice_areas) = 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidate_preferences_practice_areas_max_3'
  ) then
    alter table public.candidate_preferences
      add constraint candidate_preferences_practice_areas_max_3
      check (cardinality(practice_areas) <= 3);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidate_preferences_practice_areas_values'
  ) then
    alter table public.candidate_preferences
      add constraint candidate_preferences_practice_areas_values
      check (
        practice_areas <@ array[
          'Antitrust',
          'White Collar',
          'Int''l arb',
          'Int''l reg',
          'Gov Contracts',
          'SEC / CFTC',
          'IP / Tech Trans',
          'Labor & Employment',
          'Litigation',
          'Corp: M&A/PE',
          'Corp: Finance',
          'Corp: EC/VC',
          'Corp: Cap Mkts',
          'Real Estate',
          'Tax & Benefits',
          'Other'
        ]::text[]
      );
  end if;
end
$$;
