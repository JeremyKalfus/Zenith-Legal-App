import { useMemo } from 'react';
import type { Channel as StreamChannel } from 'stream-chat';
import { getChatClient } from './chat';
import { useCandidateChatChannel } from './use-candidate-chat-channel';

export function useResolvedCandidateChatChannel(candidateUserId?: string): {
  channel: StreamChannel | null;
  channelId: string | null;
  errorMessage: string | null;
  isLoading: boolean;
} {
  const { channelId, errorMessage, isLoading } = useCandidateChatChannel(candidateUserId);

  const channel = useMemo(() => {
    if (!channelId) {
      return null;
    }
    const client = getChatClient();
    return client.channel('messaging', channelId);
  }, [channelId]);

  return {
    channel,
    channelId,
    errorMessage,
    isLoading,
  };
}
