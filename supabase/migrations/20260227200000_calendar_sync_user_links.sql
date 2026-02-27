ALTER TYPE public.calendar_provider ADD VALUE IF NOT EXISTS 'apple';

ALTER TABLE public.calendar_event_links
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users_profile (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider_event_url text;

UPDATE public.calendar_event_links cel
SET user_id = a.candidate_user_id
FROM public.appointments a
WHERE cel.appointment_id = a.id
  AND cel.user_id IS NULL;

DELETE FROM public.calendar_event_links
WHERE user_id IS NULL;

ALTER TABLE public.calendar_event_links
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.calendar_event_links
  DROP CONSTRAINT IF EXISTS calendar_event_links_appointment_id_provider_key;

ALTER TABLE public.calendar_event_links
  DROP CONSTRAINT IF EXISTS calendar_event_links_appointment_id_provider_user_id_key;

ALTER TABLE public.calendar_event_links
  ADD CONSTRAINT calendar_event_links_appointment_id_provider_user_id_key UNIQUE (appointment_id, provider, user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_event_links_user_provider
  ON public.calendar_event_links(user_id, provider);

DROP POLICY IF EXISTS "calendar_event_links_self_or_staff" ON public.calendar_event_links;

CREATE POLICY "calendar_event_links_self_or_staff"
ON public.calendar_event_links
FOR ALL
USING (public.is_staff() OR user_id = auth.uid())
WITH CHECK (public.is_staff() OR user_id = auth.uid());
