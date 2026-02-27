-- Normalize legacy accepted appointments to scheduled status semantics.
UPDATE public.appointments
SET status = 'scheduled'
WHERE status = 'accepted';

-- Enforce overlap exclusion on scheduled appointments.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_no_overlapping_accepted_per_candidate;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_no_overlapping_scheduled_per_candidate;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_overlapping_scheduled_per_candidate
    EXCLUDE USING gist (
      candidate_user_id WITH =,
      tstzrange(start_at_utc, end_at_utc, '[)') WITH &&
    )
    WHERE (status = 'scheduled');
