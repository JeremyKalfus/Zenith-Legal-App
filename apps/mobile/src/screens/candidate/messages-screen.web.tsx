import { useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../../theme/colors';
import {
  Avatar as StreamAvatar,
  Chat,
  Channel,
  MessageInput,
  MessageList,
  Thread,
  Window,
  type AvatarProps,
} from 'stream-chat-react';
import { getChatClient } from '../../lib/chat';
import { ScreenShell } from '../../components/screen-shell';
import {
  ensureStreamChatStylesheet,
  hasChatAvatarImage,
  STREAM_CHAT_CSS_URL,
} from '@zenith/shared';
import { useResolvedCandidateChatChannel } from '../../lib/use-resolved-candidate-chat-channel';

const ZENITH_LEGAL_CHAT_AVATAR_URI = Image.resolveAssetSource(
  require('../../../assets/zenith-legal-logo.png'),
).uri;

function Avatar(props: AvatarProps) {
  const isCurrentUser = props.user?.id === getChatClient().userID;
  if (isCurrentUser) {
    return null;
  }

  if (!hasChatAvatarImage(props.image)) {
    return (
      <div
        className="str-chat__avatar str-chat__message-sender-avatar"
        data-testid="avatar"
        role="button"
        title={props.name ?? 'Zenith Legal'}
      >
        <img
          alt={props.name ?? 'Zenith Legal'}
          className="str-chat__avatar-image"
          data-testid="avatar-img"
          src={ZENITH_LEGAL_CHAT_AVATAR_URI}
          style={{ backgroundColor: '#FFFFFF', objectFit: 'contain', padding: 3 }}
        />
      </div>
    );
  }

  return <StreamAvatar {...props} />;
}

function useStreamChatCSS() {
  useEffect(() => {
    ensureStreamChatStylesheet(STREAM_CHAT_CSS_URL);
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
  const { channel, errorMessage, isLoading } = useResolvedCandidateChatChannel(candidateUserId);

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
          <Channel channel={channel} Avatar={Avatar}>
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
    color: uiColors.error,
    fontSize: 14,
  },
  loadingText: {
    color: uiColors.textMuted,
    marginTop: 8,
  },
});
