import { useEffect, useMemo, useState } from 'react';

export function useSendCooldown(defaultSeconds = 60) {
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    if (!expiresAtMs) {
      return;
    }

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAtMs]);

  const remainingSeconds = useMemo(() => {
    if (!expiresAtMs) {
      return 0;
    }
    return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  }, [expiresAtMs, nowMs]);

  useEffect(() => {
    if (expiresAtMs && remainingSeconds <= 0) {
      setExpiresAtMs(null);
    }
  }, [expiresAtMs, remainingSeconds]);

  return {
    isCoolingDown: remainingSeconds > 0,
    remainingSeconds,
    startCooldown: (seconds = defaultSeconds) => {
      setNowMs(Date.now());
      setExpiresAtMs(Date.now() + seconds * 1000);
    },
    clearCooldown: () => setExpiresAtMs(null),
  };
}
