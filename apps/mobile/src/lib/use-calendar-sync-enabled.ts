import { useEffect, useState } from 'react';
import { getSupabaseClientConfigError } from '../config/env';
import { ensureValidSession, supabase } from './supabase';

export function useCalendarSyncEnabled(userId: string | undefined): boolean {
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadCalendarConnectionState = async () => {
      if (!userId) {
        if (isMounted) {
          setCalendarSyncEnabled(false);
        }
        return;
      }

      if (getSupabaseClientConfigError()) {
        if (isMounted) {
          setCalendarSyncEnabled(false);
        }
        return;
      }

      try {
        await ensureValidSession();

        const { data, error } = await supabase
          .from('calendar_connections')
          .select('provider')
          .eq('user_id', userId)
          .eq('provider', 'apple')
          .limit(1);

        if (!isMounted || error) {
          if (isMounted) {
            setCalendarSyncEnabled(false);
          }
          return;
        }

        setCalendarSyncEnabled((data?.length ?? 0) > 0);
      } catch {
        if (isMounted) {
          setCalendarSyncEnabled(false);
        }
      }
    };

    void loadCalendarConnectionState();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  return calendarSyncEnabled;
}
