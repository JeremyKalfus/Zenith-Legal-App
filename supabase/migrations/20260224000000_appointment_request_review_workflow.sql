-- Add pending, accepted, declined to appointment_status enum (idempotent)
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'scheduled';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'declined';

-- New appointments should default to pending (require staff approval)
ALTER TABLE public.appointments ALTER COLUMN status SET DEFAULT 'pending';
