import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { StaffPageTitle } from '../../components/staff-page-title';
import { useAuth } from '../../context/auth-context';
import type { StaffMessageInboxItem } from '@zenith/shared';
import { formatRelativeTimestamp, mapChannelsToStaffInboxItems } from '@zenith/shared';
import { ensureChatUserConnected, getChatClient } from '../../lib/chat';
import { getFunctionErrorMessage } from '../../lib/function-error';
import { ensureValidSession, supabase } from '../../lib/supabase';
import { uiColors } from '../../theme/colors';

function deriveConversationName(conversation: StaffMessageInboxItem): string {
  const candidateName = conversation.candidateDisplayName?.trim();
  if (candidateName) {
    return candidateName;
  }

  const cleaned = conversation.channelName
    .replace(/\s*(?:·|-)\s*Zenith Legal\s*$/i, '')
    .trim();
  return cleaned || conversation.channelName;
}

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

function formatUnreadCount(count: number): string {
  return count > 9 ? '9+' : String(count);
}

function getInitials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'ZL';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

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
  const eventSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const hasHydratedInboxRef = useRef(false);
  const lastSilentRefreshAtRef = useRef(0);

  const syncConversationsFromClient = useCallback(() => {
    const client = getChatClient();
    const channels = Object.values(client.activeChannels ?? {});
    setConversations(mapChannelsToStaffInboxItems(channels as unknown[]));
  }, []);

  const loadInbox = useCallback(
    async ({
      isManualRefresh = false,
      isSilent = false,
    }: {
      isManualRefresh?: boolean;
      isSilent?: boolean;
    } = {}) => {
      if (!session?.user || !profile) {
        setIsLoading(false);
        return;
      }

      const shouldShowLoading = !isManualRefresh && (!isSilent || !hasHydratedInboxRef.current);

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else if (shouldShowLoading) {
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
        hasHydratedInboxRef.current = true;

        if (!eventSubscriptionRef.current) {
          eventSubscriptionRef.current = client.on((event) => {
            if (!LIVE_CHAT_EVENT_TYPES.has(event.type)) {
              return;
            }
            syncConversationsFromClient();
          });
        }
        setMessage(null);
      } catch (error) {
        setMessage(
          await getFunctionErrorMessage(error, 'Unable to load messages. Please try again.'),
        );
      } finally {
        if (shouldShowLoading) {
          setIsLoading(false);
        }
        setIsRefreshing(false);
      }
    },
    [profile, session?.user, syncConversationsFromClient],
  );

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    return () => {
      eventSubscriptionRef.current?.unsubscribe();
      eventSubscriptionRef.current = null;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      syncConversationsFromClient();
      const now = Date.now();
      if (now - lastSilentRefreshAtRef.current > 20000) {
        lastSilentRefreshAtRef.current = now;
        void loadInbox({ isSilent: true });
      }
      return undefined;
    }, [loadInbox, syncConversationsFromClient]),
  );

  const handleOpenConversation = useCallback(
    (conversation: StaffMessageInboxItem) => {
      setConversations((current) =>
        current.map((row) =>
          row.channelId === conversation.channelId ? { ...row, unreadCount: 0 } : row,
        ),
      );

      const client = getChatClient();
      const channel = client.channel('messaging', conversation.channelId);
      void channel.markRead().catch(() => undefined);

      onOpenConversation({ ...conversation, unreadCount: 0 });
    },
    [onOpenConversation],
  );

  const subtitle = useMemo(
    () =>
      conversations.length === 0
        ? 'No candidate conversations yet.'
        : `${conversations.length} active conversation${conversations.length === 1 ? '' : 's'}.`,
    [conversations.length],
  );

  return (
    <ScreenShell showBanner={false}>
      <StaffPageTitle title="Messages" />
      <Text style={styles.body}>Recruiter inbox</Text>
      <Text style={styles.subtle}>{subtitle}</Text>

      <Pressable
        style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
        onPress={() => void loadInbox({ isManualRefresh: true })}
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
          conversations.map((conversation, index) => {
            const displayName = deriveConversationName(conversation);
            const timestamp = formatRelativeTimestamp(conversation.lastMessageAt);
            const isLast = index === conversations.length - 1;
            const isUnread = conversation.unreadCount > 0;

            return (
            <Pressable
              key={conversation.channelId}
              style={({ pressed }) => [
                styles.conversationRow,
                !isLast ? styles.conversationRowBorder : null,
                pressed ? styles.conversationRowPressed : null,
              ]}
              onPress={() => handleOpenConversation(conversation)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
              </View>
              <View style={styles.conversationMain}>
                <View style={styles.conversationTopRow}>
                  <Text
                    numberOfLines={1}
                    style={[styles.conversationName, isUnread ? styles.conversationNameUnread : null]}
                  >
                    {displayName}
                  </Text>
                  <View style={styles.conversationMetaRow}>
                    {isUnread ? (
                      <View style={styles.unreadBadgeInline}>
                        <Text style={styles.unreadBadgeText}>{formatUnreadCount(conversation.unreadCount)}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.conversationTimestamp, isUnread ? styles.conversationTimestampUnread : null]}>
                      {timestamp}
                    </Text>
                  </View>
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.conversationPreview, isUnread ? styles.conversationPreviewUnread : null]}
                >
                  {conversation.lastMessagePreview}
                </Text>
              </View>
            </Pressable>
            );
          })
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: uiColors.backgroundAlt,
    borderRadius: 999,
    borderColor: uiColors.borderStrong,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarText: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: uiColors.textSecondary,
  },
  conversationMain: {
    flex: 1,
    minWidth: 0,
  },
  conversationName: {
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  conversationNameUnread: {
    fontWeight: '700',
  },
  conversationMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  conversationPreview: {
    color: uiColors.textSecondary,
    fontSize: 16,
    marginTop: 3,
  },
  conversationPreviewUnread: {
    color: uiColors.textPrimary,
    fontWeight: '700',
  },
  conversationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  conversationRowBorder: {
    borderBottomColor: uiColors.border,
    borderBottomWidth: 1,
  },
  conversationRowPressed: {
    backgroundColor: uiColors.background,
  },
  conversationTimestamp: {
    color: uiColors.textMuted,
    fontSize: 14,
  },
  conversationTimestampUnread: {
    color: uiColors.textStrong,
    fontWeight: '600',
  },
  conversationTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emptyText: {
    color: uiColors.textMuted,
    padding: 12,
    textAlign: 'center',
  },
  error: {
    color: uiColors.error,
    fontSize: 13,
  },
  list: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: uiColors.border,
    borderRadius: 10,
    padding: 10,
  },
  refreshButtonPressed: {
    backgroundColor: uiColors.borderStrong,
  },
  refreshButtonText: {
    color: uiColors.textPrimary,
    fontWeight: '600',
  },
  subtle: {
    color: uiColors.textMuted,
    fontSize: 12,
  },
  unreadBadgeInline: {
    alignItems: 'center',
    backgroundColor: uiColors.textPrimary,
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  unreadBadgeText: {
    color: uiColors.primaryText,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
