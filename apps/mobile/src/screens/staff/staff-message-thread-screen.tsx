import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  Channel,
  Chat,
  MessageAvatar as StreamMessageAvatar,
  MessageInput,
  MessageList,
  OverlayProvider,
  type MessageAvatarProps,
} from 'stream-chat-expo';
import { getChatClient } from '../../lib/chat';
import { chatThemeOverrides } from '../../lib/chat-theme-overrides';
import { uiColors } from '../../theme/colors';
import { hasChatAvatarImage } from '@zenith/shared';

function MessageAvatar(props: MessageAvatarProps) {
  if (!hasChatAvatarImage(props.message?.user?.image)) {
    return null;
  }

  return <StreamMessageAvatar {...props} />;
}

export function StaffMessageThreadScreen({
  channelId,
}: {
  channelId: string;
}) {
  const client = getChatClient();
  const channel = useMemo(() => client.channel('messaging', channelId), [channelId, client]);
  const isFocused = useIsFocused();
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [channelErrorMessage, setChannelErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsChannelReady(false);
    setChannelErrorMessage(null);

    void channel
      .watch()
      .then(() => {
        if (!isMounted) {
          return;
        }
        setIsChannelReady(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setChannelErrorMessage('Unable to load messages for this channel. Please try again.');
      });

    return () => {
      isMounted = false;
    };
  }, [channel]);

  const markChannelRead = useCallback(async () => {
    try {
      await channel.watch();
      await channel.markRead();
    } catch {
      // No-op: this should not block thread rendering.
    }
  }, [channel]);

  useFocusEffect(
    useCallback(() => {
      void markChannelRead();
      return undefined;
    }, [markChannelRead]),
  );

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const subscription = channel.on((event) => {
      if (event.type !== 'message.new') {
        return;
      }

      const currentUserId = getChatClient().userID;
      const eventUserId = typeof event.user?.id === 'string' ? event.user.id : null;
      if (!eventUserId || eventUserId === currentUserId) {
        return;
      }

      void channel.markRead().catch(() => undefined);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [channel, isFocused]);

  if (!client.userID) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.error}>Chat connection unavailable. Return to inbox and retry.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (channelErrorMessage) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.error}>{channelErrorMessage}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isChannelReady) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.chatContainer}>
        <OverlayProvider value={{ style: chatThemeOverrides }}>
          <Chat client={client}>
            <Channel
              channel={channel}
              keyboardBehavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
              messageSwipeToReplyHitSlop={{ bottom: 0, left: 0, right: 0, top: 0 }}
              MessageAvatar={MessageAvatar}
            >
              <MessageList
                additionalFlatListProps={{
                  keyboardDismissMode: 'interactive',
                  keyboardShouldPersistTaps: 'handled',
                }}
              />
              <MessageInput />
            </Channel>
          </Chat>
        </OverlayProvider>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  chatContainer: {
    flex: 1,
  },
  error: {
    color: uiColors.error,
    textAlign: 'center',
  },
  safeArea: {
    backgroundColor: uiColors.background,
    flex: 1,
  },
});
