create policy "authorizations_candidate_update"
on public.candidate_authorizations
for update
using (
  decided_by_candidate = auth.uid()
  and exists (
    select 1
    from public.candidate_firm_assignments cfa
    where cfa.id = assignment_id
      and cfa.candidate_user_id = auth.uid()
  )
)
with check (
  decided_by_candidate = auth.uid()
  and exists (
    select 1
    from public.candidate_firm_assignments cfa
    where cfa.id = assignment_id
      and cfa.candidate_user_id = auth.uid()
  )
);
