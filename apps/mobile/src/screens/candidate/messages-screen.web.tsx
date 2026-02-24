import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import {
  Chat,
  Channel,
  Window,
  MessageList,
  MessageInput,
  Thread,
} from 'stream-chat-react';
import { ensureChatUserConnected, getChatClient } from '../../lib/chat';
import { getFunctionErrorMessage } from '../../lib/function-error';
import { useAuth } from '../../context/auth-context';
import { supabase, ensureValidSession } from '../../lib/supabase';
import { ScreenShell } from '../../components/screen-shell';

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

export function MessagesScreen({
  showRecruiterBanner = true,
  candidateUserId,
}: {
  showRecruiterBanner?: boolean;
  candidateUserId?: string;
}) {
  useStreamChatCSS();
  const { session, profile } = useAuth();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const connectedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      if (!session?.user || !profile) {
        setIsLoading(false);
        return;
      }

      try {
        await ensureValidSession();
        const { data, error } = await supabase.functions.invoke('chat_auth_bootstrap', {
          body: { user_id: candidateUserId ?? session.user.id },
        });

        if (error) {
          const message = await getFunctionErrorMessage(
            error,
            'Unable to connect to chat. Please try again.',
          );
          if (isMounted) setErrorMessage(message);
          return;
        }

        const response = data as {
          token: string;
          channel_id?: string;
          user_name: string;
          user_image?: string;
        };

        if (!response.channel_id) {
          if (isMounted) setErrorMessage('Unable to load chat channel.');
          return;
        }

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

        if (isMounted) {
          setChannelId(response.channel_id);
          setErrorMessage('');
        }
      } catch (err) {
        if (isMounted) {
          const message = await getFunctionErrorMessage(
            err,
            'Unable to connect to chat. Please try again.',
          );
          setErrorMessage(message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [candidateUserId, profile, session?.user]);

  const channel = useMemo(() => {
    if (!channelId) {
      return null;
    }

    const client = getChatClient();
    return client.channel('messaging', channelId);
  }, [channelId]);

  if (isLoading) {
    return (
      <ScreenShell showBanner={showRecruiterBanner}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Connecting to chat...</Text>
        </View>
      </ScreenShell>
    );
  }

  if (errorMessage || !channel) {
    return (
      <ScreenShell showBanner={showRecruiterBanner}>
        <View style={styles.center}>
          <Text style={styles.error}>
            {errorMessage || 'Unable to load chat channel.'}
          </Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell showBanner={showRecruiterBanner}>
      <View style={styles.chatWrapper}>
        <Chat client={getChatClient()} theme="str-chat__theme-light">
          <Channel channel={channel}>
            <Window>
              <MessageList />
              <MessageInput focus />
            </Window>
            <Thread />
          </Channel>
        </Chat>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  chatWrapper: {
    flex: 1,
    minHeight: 500,
  },
  error: {
    color: '#B91C1C',
    fontSize: 14,
  },
  loadingText: {
    color: '#64748B',
    marginTop: 8,
  },
});
