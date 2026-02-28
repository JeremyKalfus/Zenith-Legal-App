import { useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { uiColors } from '../../theme/colors';
import {
  Chat,
  Channel,
  Window,
  MessageList,
  MessageInput,
  Thread,
} from 'stream-chat-react';
import { getChatClient } from '../../lib/chat';
import { ScreenShell } from '../../components/screen-shell';
import { CandidatePageTitle } from '../../components/candidate-page-title';
import { ensureStreamChatStylesheet, STREAM_CHAT_CSS_URL } from '@zenith/shared';
import { useResolvedCandidateChatChannel } from '../../lib/use-resolved-candidate-chat-channel';

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
  const showCandidateTitle = !candidateUserId;

  if (isLoading) {
    return (
      <ScreenShell showBanner={showRecruiterBanner}>
        {showCandidateTitle ? <CandidatePageTitle title="Messages" /> : null}
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
        {showCandidateTitle ? <CandidatePageTitle title="Messages" /> : null}
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
      {showCandidateTitle ? <CandidatePageTitle title="Messages" /> : null}
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
    color: uiColors.error,
    fontSize: 14,
  },
  loadingText: {
    color: uiColors.textMuted,
    marginTop: 8,
  },
});
