import { useCallback, useEffect, useState } from 'react';
import { bucketCandidateAppointments, type AppointmentStatus } from '@zenith/shared';
import { useAuth } from '../context/auth-context';
import { supabase } from './supabase';
import { ensureChatUserConnected, getChatClient } from './chat';

const LIVE_CHAT_EVENT_TYPES = new Set([
  'message.new',
  'message.updated',
  'message.deleted',
  'notification.message_new',
  'notification.mark_read',
  'notification.mark_unread',
  'notification.added_to_channel',
  'channel.updated',
  'channel.deleted',
  'channel.hidden',
  'channel.visible',
]);

type ChatBootstrapResponse = {
  token: string;
  user_name: string;
  user_image?: string;
};

type AppointmentIndicatorRow = {
  id: string;
  status: AppointmentStatus;
  start_at_utc: string;
  end_at_utc: string;
  candidate_user_id: string;
  created_by_user_id: string;
};

function computeUnreadTotalFromActiveChannels(): number {
  const client = getChatClient();
  const channels = Object.values(client.activeChannels ?? {});
  return channels.reduce((total, channel) => {
    if (typeof channel.countUnread !== 'function') {
      return total;
    }
    return total + channel.countUnread();
  }, 0);
}

export function useCandidateTabIndicators(): {
  hasAppointmentAttention: boolean;
  unreadMessagesCount: number;
} {
  const { session, profile } = useAuth();
  const [hasAppointmentAttention, setHasAppointmentAttention] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const refreshAppointmentAttention = useCallback(async () => {
    if (!session?.user) {
      setHasAppointmentAttention(false);
      return;
    }

    const { data, error } = await supabase
      .from('appointments')
      .select('id,status,start_at_utc,end_at_utc,candidate_user_id,created_by_user_id')
      .in('status', ['scheduled', 'pending']);

    if (error) {
      return;
    }

    const rows = (data ?? []) as AppointmentIndicatorRow[];
    const buckets = bucketCandidateAppointments(rows, session.user.id);
    setHasAppointmentAttention(
      buckets.overdueConfirmed.length > 0 || buckets.upcomingAppointments.length > 0,
    );
  }, [session?.user]);

  const refreshUnreadMessages = useCallback(async () => {
    if (!session?.user || !profile) {
      setUnreadMessagesCount(0);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('chat_auth_bootstrap', {
        body: {},
      });

      if (error) {
        return;
      }

      const response = data as ChatBootstrapResponse;
      const client = getChatClient();
      if (client.userID !== session.user.id) {
        await ensureChatUserConnected(
          {
            id: session.user.id,
            name: response.user_name || profile.name || undefined,
            image: response.user_image,
          },
          response.token,
        );
      }

      await client.queryChannels(
        {
          type: 'messaging',
          members: { $in: [session.user.id] },
        },
        [{ last_message_at: -1 }],
        {
          watch: true,
          state: true,
          limit: 100,
        },
      );

      setUnreadMessagesCount(computeUnreadTotalFromActiveChannels());
    } catch {
      // Keep last unread value when refresh fails.
    }
  }, [profile, session?.user]);

  useEffect(() => {
    void refreshUnreadMessages();
    void refreshAppointmentAttention();

    const appointmentsChannel = supabase
      .channel(`candidate-tabs-appointments-${session?.user?.id ?? 'anonymous'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          void refreshAppointmentAttention();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(appointmentsChannel);
    };
  }, [refreshAppointmentAttention, refreshUnreadMessages, session?.user?.id]);

  useEffect(() => {
    const client = getChatClient();
    const subscription = client.on((event) => {
      if (!LIVE_CHAT_EVENT_TYPES.has(event.type)) {
        return;
      }
      setUnreadMessagesCount(computeUnreadTotalFromActiveChannels());
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void refreshAppointmentAttention();
      void refreshUnreadMessages();
    }, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshAppointmentAttention, refreshUnreadMessages]);

  return { hasAppointmentAttention, unreadMessagesCount };
}
