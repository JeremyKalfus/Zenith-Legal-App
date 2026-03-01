import { bucketStaffAppointments, mapChannelsToStaffInboxItems, type AppointmentStatus } from '@zenith/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { ensureChatUserConnected, getChatClient } from './chat';
import { supabase } from './supabase';

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
  const inboxItems = mapChannelsToStaffInboxItems(channels as unknown[]);
  return inboxItems.reduce((total, item) => total + item.unreadCount, 0);
}

export function useStaffTabIndicators(): {
  unreadMessagesCount: number;
  hasAppointmentAttention: boolean;
} {
  const { session, profile } = useAuth();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [hasAppointmentAttention, setHasAppointmentAttention] = useState(false);
  const chatSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

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
    const buckets = bucketStaffAppointments(rows);
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

      if (!chatSubscriptionRef.current) {
        chatSubscriptionRef.current = client.on((event) => {
          if (!LIVE_CHAT_EVENT_TYPES.has(event.type)) {
            return;
          }
          setUnreadMessagesCount(computeUnreadTotalFromActiveChannels());
        });
      }
    } catch {
      // Keep existing indicator state when refresh fails.
    }
  }, [profile, session?.user]);

  useEffect(() => {
    void refreshUnreadMessages();
    void refreshAppointmentAttention();

    const appointmentsChannel = supabase
      .channel(`staff-tabs-appointments-${session?.user?.id ?? 'anonymous'}`)
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
    const intervalId = setInterval(() => {
      void refreshAppointmentAttention();
    }, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshAppointmentAttention]);

  useEffect(() => {
    return () => {
      chatSubscriptionRef.current?.unsubscribe();
      chatSubscriptionRef.current = null;
    };
  }, []);

  return {
    unreadMessagesCount,
    hasAppointmentAttention,
  };
}
