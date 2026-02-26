import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { useAuth } from '../../context/auth-context';
import type { StaffMessageInboxItem } from '@zenith/shared';
import { formatRelativeTimestamp, mapChannelsToStaffInboxItems } from '@zenith/shared';
import { ensureChatUserConnected, getChatClient } from '../../lib/chat';
import { getFunctionErrorMessage } from '../../lib/function-error';
import { ensureValidSession, supabase } from '../../lib/supabase';

export function StaffMessagesScreen({
  onOpenConversation,
}: {
  onOpenConversation: (conversation: StaffMessageInboxItem) => void;
}) {
  const { session, profile } = useAuth();
  const [conversations, setConversations] = useState<StaffMessageInboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const connectedRef = useRef(false);

  const loadInbox = useCallback(
    async (isManualRefresh = false) => {
      if (!session?.user || !profile) {
        setIsLoading(false);
        return;
      }

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        await ensureValidSession();
        const { data, error } = await supabase.functions.invoke('chat_auth_bootstrap', {
          body: {},
        });

        if (error) {
          throw new Error(
            await getFunctionErrorMessage(error, 'Unable to load messages. Please try again.'),
          );
        }

        const response = data as {
          token: string;
          user_name: string;
          user_image?: string;
        };

        if (!connectedRef.current) {
          await ensureChatUserConnected(
            {
              id: session.user.id,
              name: response.user_name || profile.name || undefined,
              image: response.user_image,
            },
            response.token,
          );
          connectedRef.current = true;
        }

        const client = getChatClient();

        const channels = await client.queryChannels(
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

        setConversations(mapChannelsToStaffInboxItems(channels as unknown[]));
        setMessage(null);
      } catch (error) {
        setMessage(
          await getFunctionErrorMessage(error, 'Unable to load messages. Please try again.'),
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [profile, session?.user],
  );

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const subtitle = useMemo(
    () =>
      conversations.length === 0
        ? 'No candidate conversations yet.'
        : `${conversations.length} active conversation${conversations.length === 1 ? '' : 's'}.`,
    [conversations.length],
  );

  return (
    <ScreenShell showBanner={false}>
      <Text style={styles.title}>Messages</Text>
      <Text style={styles.body}>Recruiter inbox for candidate conversations.</Text>
      <Text style={styles.subtle}>{subtitle}</Text>

      <Pressable
        style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
        onPress={() => void loadInbox(true)}
      >
        <Text style={styles.refreshButtonText}>
          {isRefreshing ? 'Refreshing...' : 'Refresh inbox'}
        </Text>
      </Pressable>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <View style={styles.list}>
        {isLoading ? (
          <Text style={styles.emptyText}>Loading conversations...</Text>
        ) : conversations.length === 0 ? (
          <Text style={styles.emptyText}>No channels with messages yet.</Text>
        ) : (
          conversations.map((conversation) => (
            <Pressable
              key={conversation.channelId}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => onOpenConversation(conversation)}
            >
              <View style={styles.cardHeader}>
                <Text numberOfLines={1} style={styles.cardTitle}>
                  {conversation.channelName}
                </Text>
                <Text style={styles.cardTimestamp}>
                  {formatRelativeTimestamp(conversation.lastMessageAt)}
                </Text>
              </View>
              <Text numberOfLines={2} style={styles.cardPreview}>
                {conversation.lastMessagePreview}
              </Text>
              {conversation.unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ))
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0F172A',
    borderRadius: 999,
    marginTop: 8,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: '#475569',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  cardPreview: {
    color: '#334155',
    marginTop: 4,
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
  },
  cardTimestamp: {
    color: '#64748B',
    flexShrink: 0,
    fontSize: 12,
    marginLeft: 8,
  },
  cardTitle: {
    color: '#0F172A',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748B',
    padding: 12,
    textAlign: 'center',
  },
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
  list: {
    gap: 10,
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
  },
  refreshButtonPressed: {
    backgroundColor: '#CBD5E1',
  },
  refreshButtonText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  subtle: {
    color: '#64748B',
    fontSize: 12,
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
});
