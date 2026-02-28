import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../../theme/colors';
import { Channel, Chat, MessageInput, MessageList, OverlayProvider } from 'stream-chat-expo';
import { getChatClient } from '../../lib/chat';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';
import { CandidatePageTitle } from '../../components/candidate-page-title';
import { useResolvedCandidateChatChannel } from '../../lib/use-resolved-candidate-chat-channel';

export function MessagesScreen({
  showRecruiterBanner = true,
  candidateUserId,
}: {
  showRecruiterBanner?: boolean;
  candidateUserId?: string;
}) {
  const { channel, errorMessage, isLoading } = useResolvedCandidateChatChannel(candidateUserId);
  const showCandidateTitle = !candidateUserId;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {showRecruiterBanner ? <GlobalRecruiterBanner /> : null}
        {showCandidateTitle ? (
          <View style={styles.titleWrap}>
            <CandidatePageTitle title="Messages" />
          </View>
        ) : null}
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
        {showCandidateTitle ? (
          <View style={styles.titleWrap}>
            <CandidatePageTitle title="Messages" />
          </View>
        ) : null}
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage || 'Unable to load chat channel.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {showRecruiterBanner ? <GlobalRecruiterBanner /> : null}
      {showCandidateTitle ? (
        <View style={styles.titleWrap}>
          <CandidatePageTitle title="Messages" />
        </View>
      ) : null}
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
    color: uiColors.error,
  },
  safeArea: {
    backgroundColor: uiColors.background,
    flex: 1,
  },
  titleWrap: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
});
