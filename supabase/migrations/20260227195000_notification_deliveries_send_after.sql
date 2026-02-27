ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS send_after_utc timestamptz NOT NULL DEFAULT timezone('utc', now());

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_dispatch_queue
  ON public.notification_deliveries(channel, status, send_after_utc, created_at);
