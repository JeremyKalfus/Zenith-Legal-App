'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Channel, Chat, MessageInput, MessageList, Thread, Window } from 'stream-chat-react';
import type { Channel as StreamChannel } from 'stream-chat';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { supabaseClient } from '@/lib/supabase-client';
import { getFunctionErrorMessage } from '@/lib/function-error';
import {
  ensureChatUserConnected,
  getChatClient,
  getStreamChatConfigError,
  isStreamChatConfigured,
} from '@/lib/chat';
import type { StaffMessageInboxItem } from '@zenith/shared';
import {
  ensureStreamChatStylesheet,
  formatRelativeTimestamp,
  mapChannelsToStaffInboxItems,
  STREAM_CHAT_CSS_URL,
} from '@zenith/shared';

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

function useStreamChatCSS() {
  useEffect(() => {
    ensureStreamChatStylesheet(STREAM_CHAT_CSS_URL);
  }, []);
}

type ChatBootstrapResponse = {
  token: string;
  user_name: string;
  user_image?: string;
};

async function queryStaffInboxItems(sessionUserId: string): Promise<StaffMessageInboxItem[]> {
  const streamClient = getChatClient();
  const channels = await streamClient.queryChannels(
    { type: 'messaging', members: { $in: [sessionUserId] } },
    [{ last_message_at: -1 }],
    { watch: true, state: true, limit: 100 },
  );
  const inboxItems = mapChannelsToStaffInboxItems(channels as unknown[]);
  const candidateIds = Array.from(new Set(inboxItems.map((item) => item.candidateUserId))).filter(Boolean);

  if (candidateIds.length === 0) {
    return inboxItems;
  }

  const { data, error } = await supabaseClient
    .from('users_profile')
    .select('id,name')
    .in('id', candidateIds);

  if (error) {
    return inboxItems;
  }

  const profileById = new Map(
    ((data ?? []) as { id: string; name: string | null }[]).map((row) => [
      row.id,
      row,
    ]),
  );

  return inboxItems.map((item) => {
    const profile = profileById.get(item.candidateUserId);
    return {
      ...item,
      candidateDisplayName: profile?.name ?? item.candidateDisplayName ?? null,
    };
  });
}

function useStaffMessagesDashboard() {
  useStreamChatCSS();

  const [conversations, setConversations] = useState<StaffMessageInboxItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const connectedRef = useRef(false);
  const eventSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  const loadInbox = useCallback(async (isManualRefresh = false) => {
    if (!isStreamChatConfigured()) {
      setErrorMessage(getStreamChatConfigError());
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabaseClient.auth.getSession();

      if (sessionError || !session?.user) {
        throw new Error('Unable to load your staff session. Please sign in again.');
      }

      setSessionUserId(session.user.id);

      const { data, error } = await supabaseClient.functions.invoke('chat_auth_bootstrap', {
        body: {},
      });

      if (error) {
        throw new Error(
          await getFunctionErrorMessage(error, 'Unable to load messages. Please try again.'),
        );
      }

      const response = data as ChatBootstrapResponse;

      if (!connectedRef.current) {
        await ensureChatUserConnected(
          {
            id: session.user.id,
            name: response.user_name || undefined,
            image: response.user_image,
          },
          response.token,
        );
        connectedRef.current = true;
      }

      const inboxItems = await queryStaffInboxItems(session.user.id);
      setConversations(inboxItems);
      setSelectedChannelId((current) => {
        if (current && inboxItems.some((item) => item.channelId === current)) {
          return current;
        }
        return null;
      });

      if (!eventSubscriptionRef.current) {
        const client = getChatClient();
        eventSubscriptionRef.current = client.on((event) => {
          if (!LIVE_CHAT_EVENT_TYPES.has(event.type)) {
            return;
          }

          const channels = Object.values(client.activeChannels ?? {});
          setConversations(mapChannelsToStaffInboxItems(channels as unknown[]));
        });
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(await getFunctionErrorMessage(error, 'Unable to load messages. Please try again.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    return () => {
      eventSubscriptionRef.current?.unsubscribe();
      eventSubscriptionRef.current = null;
    };
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.channelId === selectedChannelId) ?? null,
    [conversations, selectedChannelId],
  );

  const selectedChannel = useMemo<StreamChannel | null>(() => {
    if (!selectedConversation || !sessionUserId || errorMessage) {
      return null;
    }

    try {
      const client = getChatClient();
      return client.channel('messaging', selectedConversation.channelId);
    } catch {
      return null;
    }
  }, [errorMessage, selectedConversation, sessionUserId]);

  const handleRefresh = useCallback(() => {
    void loadInbox(true);
  }, [loadInbox]);

  const handleSelectChannel = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.channelId === channelId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    );

    const client = getChatClient();
    const channel = client.channel('messaging', channelId);
    void channel.watch().then(() => channel.markRead()).catch(() => undefined);
  }, []);

  return {
    conversations,
    selectedChannelId,
    isLoading,
    isRefreshing,
    errorMessage,
    selectedConversation,
    selectedChannel,
    handleRefresh,
    handleSelectChannel,
  };
}

export function StaffMessagesDashboard() {
  const {
    conversations,
    selectedChannelId,
    isLoading,
    isRefreshing,
    errorMessage,
    selectedConversation,
    selectedChannel,
    handleRefresh,
    handleSelectChannel,
  } = useStaffMessagesDashboard();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Messages</h2>
          <p className="text-sm text-slate-600">
            Staff inbox for all candidate DM channels with recent messages.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh inbox'}
        </Button>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Inbox</CardTitle>
            <CardDescription>
              {isLoading
                ? 'Loading conversations...'
                : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                Loading conversations...
              </p>
            ) : conversations.length === 0 ? (
              <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                No candidate channels with messages yet.
              </p>
            ) : (
              <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.channelId}
                    type="button"
                    className={[
                      'w-full rounded-md border px-3 py-3 text-left',
                      conversation.channelId === selectedChannelId
                        ? 'border-sky-300 bg-sky-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    ].join(' ')}
                    onClick={() => handleSelectChannel(conversation.channelId)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                          {conversation.candidateDisplayName || conversation.channelName}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-slate-500">
                        {formatRelativeTimestamp(conversation.lastMessageAt)}
                      </p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {conversation.lastMessagePreview}
                    </p>
                    {conversation.unreadCount > 0 ? (
                      <span className="mt-2 inline-flex min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedConversation?.candidateDisplayName || selectedConversation?.channelName || 'Conversation'}
            </CardTitle>
            <CardDescription>
              {selectedConversation
                ? `Candidate user ID: ${selectedConversation.candidateUserId}`
                : 'Select a conversation from the inbox.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedChannel ? (
              <div className="flex min-h-[560px] items-center justify-center rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                {isLoading ? 'Loading conversation…' : 'Select a conversation to view messages.'}
              </div>
            ) : (
              <div className="h-[560px] overflow-hidden rounded-md border border-slate-200 bg-white">
                <Chat client={getChatClient()} theme="str-chat__theme-light">
                  <Channel channel={selectedChannel}>
                    <Window>
                      <MessageList />
                      <MessageInput focus />
                    </Window>
                    <Thread />
                  </Channel>
                </Chat>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
