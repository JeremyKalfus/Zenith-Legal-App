import { useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Channel, Chat, MessageInput, MessageList, OverlayProvider } from 'stream-chat-expo';
import { getChatClient } from '../../lib/chat';
import { uiColors } from '../../theme/colors';

export function StaffMessageThreadScreen({
  channelId,
}: {
  channelId: string;
}) {
  const client = getChatClient();
  const channel = useMemo(() => client.channel('messaging', channelId), [channelId, client]);
  const isFocused = useIsFocused();

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.chatContainer}>
        <OverlayProvider>
          <Chat client={client}>
            <Channel
              channel={channel}
              keyboardBehavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
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
