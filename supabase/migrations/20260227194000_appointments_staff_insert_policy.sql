DROP POLICY IF EXISTS "appointments_create_self_or_staff" ON public.appointments;

CREATE POLICY "appointments_create_self_or_staff"
ON public.appointments
FOR INSERT
WITH CHECK (
  public.is_staff()
  OR (candidate_user_id = auth.uid() AND created_by_user_id = auth.uid())
);
