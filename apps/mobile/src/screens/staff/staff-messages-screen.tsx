import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
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
      <Text style={styles.body}>Recruiter inbox</Text>
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
          conversations.map((conversation, index) => {
            const displayName = deriveConversationName(conversation);
            const timestamp = formatRelativeTimestamp(conversation.lastMessageAt);
            const isLast = index === conversations.length - 1;

            return (
            <Pressable
              key={conversation.channelId}
              style={({ pressed }) => [
                styles.conversationRow,
                !isLast ? styles.conversationRowBorder : null,
                pressed ? styles.conversationRowPressed : null,
              ]}
              onPress={() => onOpenConversation(conversation)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
              </View>
              <View style={styles.conversationMain}>
                <View style={styles.conversationTopRow}>
                  <Text numberOfLines={1} style={styles.conversationName}>
                    {displayName}
                  </Text>
                  <Text style={styles.conversationTimestamp}>
                    {timestamp}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.conversationPreview}>
                  {conversation.lastMessagePreview}
                </Text>
              </View>
              {conversation.unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{conversation.unreadCount}</Text>
                </View>
              ) : null}
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
    fontWeight: '700',
  },
  conversationPreview: {
    color: uiColors.textSecondary,
    fontSize: 16,
    marginTop: 3,
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
    marginLeft: 8,
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
  title: {
    color: uiColors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: uiColors.textPrimary,
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unreadBadgeText: {
    color: uiColors.primaryText,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
