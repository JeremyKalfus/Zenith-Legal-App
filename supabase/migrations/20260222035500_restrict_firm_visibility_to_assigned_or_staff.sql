drop policy if exists "firms_read_authenticated" on public.firms;

create policy "firms_assigned_or_staff_select"
on public.firms
for select
using (
  public.is_staff() or exists (
    select 1
    from public.candidate_firm_assignments cfa
    where cfa.firm_id = firms.id
      and cfa.candidate_user_id = auth.uid()
  )
);
