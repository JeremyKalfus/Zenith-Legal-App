import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../../theme/colors';
import {
  Channel,
  Chat,
  MessageAvatar as StreamMessageAvatar,
  MessageInput,
  MessageList,
  type MessageAvatarProps,
  OverlayProvider,
  useMessageComposer,
} from 'stream-chat-expo';
import { getChatClient } from '../../lib/chat';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';
import { useResolvedCandidateChatChannel } from '../../lib/use-resolved-candidate-chat-channel';
import { chatThemeOverrides } from '../../lib/chat-theme-overrides';
import { hasChatAvatarImage } from '@zenith/shared';

function MessageAvatar(props: MessageAvatarProps) {
  if (!hasChatAvatarImage(props.message?.user?.image)) {
    return null;
  }

  return <StreamMessageAvatar {...props} />;
}

function ApplyInitialDraftMessage({
  message,
  messageId,
  onApplied,
}: {
  message?: string | null;
  messageId?: number;
  onApplied?: (messageId: number) => void;
}) {
  const messageComposer = useMessageComposer();
  const lastAppliedMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    const normalized = message?.trim();
    if (!normalized || typeof messageId !== 'number') {
      return;
    }
    if (lastAppliedMessageIdRef.current === messageId) {
      return;
    }

    messageComposer.textComposer.setText(normalized);
    messageComposer.textComposer.setSelection({
      start: normalized.length,
      end: normalized.length,
    });
    lastAppliedMessageIdRef.current = messageId;
    onApplied?.(messageId);
  }, [message, messageComposer, messageId, onApplied]);

  return null;
}

export function MessagesScreen({
  showRecruiterBanner = true,
  candidateUserId,
  initialDraftMessage,
  initialDraftMessageId,
  onConsumeInitialDraftMessage,
}: {
  showRecruiterBanner?: boolean;
  candidateUserId?: string;
  initialDraftMessage?: string | null;
  initialDraftMessageId?: number;
  onConsumeInitialDraftMessage?: (messageId: number) => void;
}) {
  const { channel, errorMessage, isLoading } = useResolvedCandidateChatChannel(candidateUserId);
  const isFocused = useIsFocused();
  const markChannelRead = useCallback(async () => {
    if (!channel) {
      return;
    }

    try {
      await channel.watch();
      await channel.markRead();
    } catch {
      // No-op: read markers should not block rendering.
    }
  }, [channel]);

  useFocusEffect(
    useCallback(() => {
      void markChannelRead();
      return undefined;
    }, [markChannelRead]),
  );

  useEffect(() => {
    if (!channel || !isFocused) {
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
        <OverlayProvider value={{ style: chatThemeOverrides }}>
          <Chat client={getChatClient()}>
            <Channel
              channel={channel}
              keyboardBehavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
              MessageAvatar={MessageAvatar}
            >
              <ApplyInitialDraftMessage
                message={initialDraftMessage}
                messageId={initialDraftMessageId}
                onApplied={onConsumeInitialDraftMessage}
              />
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
    color: uiColors.error,
  },
  safeArea: {
    backgroundColor: uiColors.background,
    flex: 1,
  },
});
