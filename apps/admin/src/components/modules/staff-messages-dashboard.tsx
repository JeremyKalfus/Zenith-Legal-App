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
import type { StaffMessageInboxItem } from '@/features/staff-messaging';
import { mapChannelsToStaffInboxItems } from '@/features/staff-messaging';

const STREAM_CSS_URL =
  'https://cdn.jsdelivr.net/npm/stream-chat-react@13.14.0/dist/css/v2/index.css';

function useStreamChatCSS() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'stream-chat-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = STREAM_CSS_URL;
    document.head.appendChild(link);
  }, []);
}

function formatRelativeTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  if (yesterday.toDateString() === date.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

type ChatBootstrapResponse = {
  token: string;
  user_name: string;
  user_image?: string;
};

export function StaffMessagesDashboard() {
  useStreamChatCSS();

  const [conversations, setConversations] = useState<StaffMessageInboxItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const connectedRef = useRef(false);

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

      const inboxItems = mapChannelsToStaffInboxItems(channels as unknown[]);
      setConversations(inboxItems);
      setSelectedChannelId((current) => {
        if (current && inboxItems.some((item) => item.channelId === current)) {
          return current;
        }
        return inboxItems[0]?.channelId ?? null;
      });
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
          onClick={() => {
            void loadInbox(true);
          }}
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
                    onClick={() => setSelectedChannelId(conversation.channelId)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                        {conversation.channelName}
                      </p>
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
            <CardTitle>{selectedConversation?.channelName ?? 'Conversation'}</CardTitle>
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
