DELETE FROM public.calendar_event_links
WHERE provider::text = 'google';

DELETE FROM public.calendar_connections
WHERE provider::text = 'google';

CREATE TYPE public.calendar_provider_new AS ENUM ('apple', 'microsoft');

ALTER TABLE public.calendar_connections
  ALTER COLUMN provider TYPE public.calendar_provider_new
  USING provider::text::public.calendar_provider_new;

ALTER TABLE public.calendar_event_links
  ALTER COLUMN provider TYPE public.calendar_provider_new
  USING provider::text::public.calendar_provider_new;

DROP TYPE public.calendar_provider;
ALTER TYPE public.calendar_provider_new RENAME TO calendar_provider;
