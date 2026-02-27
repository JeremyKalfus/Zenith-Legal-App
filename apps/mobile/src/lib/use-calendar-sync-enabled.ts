import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useCalendarSyncEnabled(userId: string | undefined): boolean {
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);

  useEffect(() => {
    const loadCalendarConnectionState = async () => {
      if (!userId) {
        setCalendarSyncEnabled(false);
        return;
      }

      const { data, error } = await supabase
        .from('calendar_connections')
        .select('provider')
        .eq('user_id', userId)
        .in('provider', ['google', 'apple'])
        .limit(1);

      if (error) {
        return;
      }

      setCalendarSyncEnabled((data?.length ?? 0) > 0);
    };

    void loadCalendarConnectionState();
  }, [userId]);

  return calendarSyncEnabled;
}
