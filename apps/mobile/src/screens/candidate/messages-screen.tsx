import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Channel, Chat, MessageInput, MessageList, OverlayProvider } from 'stream-chat-expo';
import { ensureChatUserConnected, getChatClient } from '../../lib/chat';
import { useAuth } from '../../context/auth-context';
import { getFunctionErrorMessage } from '../../lib/function-error';
import { ensureValidSession, supabase } from '../../lib/supabase';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';

export function MessagesScreen({
  showRecruiterBanner = true,
  candidateUserId,
}: {
  showRecruiterBanner?: boolean;
  candidateUserId?: string;
}) {
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
          body: {
            user_id: candidateUserId ?? session.user.id,
          },
        });

        if (error) {
          const message = await getFunctionErrorMessage(
            error,
            'Unable to connect to chat. Please try again.',
          );
          if (isMounted) {
            setErrorMessage(message);
          }
          return;
        }

        const response = data as {
          token: string;
          channel_id?: string;
          user_name: string;
          user_image?: string;
        };

        if (!response.channel_id) {
          if (isMounted) {
            setErrorMessage('Unable to load chat channel.');
          }
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
      } catch (error) {
        if (isMounted) {
          const message = await getFunctionErrorMessage(
            error,
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
      <SafeAreaView style={styles.safeArea}>
        {showRecruiterBanner ? <GlobalRecruiterBanner /> : null}
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage || !channel) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {showRecruiterBanner ? <GlobalRecruiterBanner /> : null}
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage || 'Unable to load chat channel.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {showRecruiterBanner ? <GlobalRecruiterBanner /> : null}
      <View style={styles.chatContainer}>
        <OverlayProvider>
          <Chat client={getChatClient()}>
            <Channel channel={channel}>
              <MessageList />
              <MessageInput />
            </Channel>
          </Chat>
        </OverlayProvider>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chatContainer: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  error: {
    color: '#B91C1C',
  },
  safeArea: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
});
