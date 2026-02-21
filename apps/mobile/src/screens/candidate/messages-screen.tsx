import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Channel, Chat, MessageInput, MessageList, OverlayProvider } from 'stream-chat-expo';
import { getChatClient } from '../../lib/chat';
import { useAuth } from '../../context/auth-context';
import { supabase } from '../../lib/supabase';

export function MessagesScreen() {
  const { session, profile } = useAuth();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      if (!session?.user || !profile) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('chat_auth_bootstrap', {
          body: {
            user_id: session.user.id,
          },
        });

        if (error) {
          throw error;
        }

        const response = data as {
          token: string;
          channel_id: string;
          user_name: string;
        };

        const client = getChatClient();
        await client.connectUser(
          {
            id: session.user.id,
            name: response.user_name || profile.name,
          },
          response.token,
        );

        if (isMounted) {
          setChannelId(response.channel_id);
          setErrorMessage('');
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage((error as Error).message);
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
  }, [profile, session?.user]);

  const channel = useMemo(() => {
    if (!channelId) {
      return null;
    }

    const client = getChatClient();
    return client.channel('messaging', channelId);
  }, [channelId]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (errorMessage || !channel) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{errorMessage || 'Unable to load chat channel.'}</Text>
      </View>
    );
  }

  return (
    <OverlayProvider>
      <Chat client={getChatClient()}>
        <Channel channel={channel}>
          <MessageList />
          <MessageInput />
        </Channel>
      </Chat>
    </OverlayProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  error: {
    color: '#B91C1C',
  },
});
