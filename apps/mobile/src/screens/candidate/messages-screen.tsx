import { useCallback, useEffect } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type ImageProps,
} from 'react-native';
import { uiColors } from '../../theme/colors';
import {
  Channel,
  Chat,
  MessageAvatar as StreamMessageAvatar,
  MessageInput,
  MessageList,
  type MessageAvatarProps,
  OverlayProvider,
} from 'stream-chat-expo';
import { getChatClient } from '../../lib/chat';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';
import { useResolvedCandidateChatChannel } from '../../lib/use-resolved-candidate-chat-channel';
import { chatThemeOverrides } from '../../lib/chat-theme-overrides';
import { hasChatAvatarImage } from '@zenith/shared';

const ZENITH_LEGAL_CHAT_AVATAR_URI = Image.resolveAssetSource(
  require('../../../assets/zenith-legal-logo.png'),
).uri;

function ZenithLogoImage(props: ImageProps) {
  return (
    <Image
      {...props}
      resizeMode="contain"
      style={[props.style, styles.zenithLogoAvatarImage]}
    />
  );
}

function MessageAvatar(props: MessageAvatarProps) {
  const messageUserId = typeof props.message?.user?.id === 'string' ? props.message.user.id : null;
  const isCurrentUser = messageUserId === getChatClient().userID;

  if (isCurrentUser) {
    return null;
  }

  if (!hasChatAvatarImage(props.message?.user?.image)) {
    const messageWithZenithLogo = {
      ...(props.message ?? {}),
      user: {
        ...(props.message?.user ?? {}),
        image: ZENITH_LEGAL_CHAT_AVATAR_URI,
        name: props.message?.user?.name ?? 'Zenith Legal',
      },
    } as typeof props.message;

    return (
      <StreamMessageAvatar
        {...props}
        ImageComponent={ZenithLogoImage}
        message={messageWithZenithLogo}
      />
    );
  }

  return <StreamMessageAvatar {...props} />;
}

export function MessagesScreen({
  showRecruiterBanner = true,
  candidateUserId,
}: {
  showRecruiterBanner?: boolean;
  candidateUserId?: string;
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
  zenithLogoAvatarImage: {
    backgroundColor: '#FFFFFF',
    padding: 3,
  },
});
