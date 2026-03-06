import { useEffect, useState } from 'react';
import type { Channel as StreamChannel } from 'stream-chat';
import { getChatClient } from './chat';
import { useCandidateChatChannel } from './use-candidate-chat-channel';

export function useResolvedCandidateChatChannel(candidateUserId?: string): {
  channel: StreamChannel | null;
  channelId: string | null;
  errorMessage: string | null;
  isLoading: boolean;
} {
  const {
    channelId,
    errorMessage: bootstrapErrorMessage,
    isLoading: isBootstrapping,
  } = useCandidateChatChannel(candidateUserId);
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [channelErrorMessage, setChannelErrorMessage] = useState<string | null>(null);
  const [isResolvingChannel, setIsResolvingChannel] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!channelId) {
      setChannel(null);
      setChannelErrorMessage(null);
      setIsResolvingChannel(false);
      return () => {
        isMounted = false;
      };
    }

    const nextChannel = getChatClient().channel('messaging', channelId);
    setIsResolvingChannel(true);
    setChannelErrorMessage(null);

    void nextChannel
      .watch()
      .then(() => {
        if (!isMounted) {
          return;
        }
        setChannel(nextChannel);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setChannel(null);
        setChannelErrorMessage('Unable to load messages for this channel. Please try again.');
      })
      .finally(() => {
        if (!isMounted) {
          return;
        }
        setIsResolvingChannel(false);
      });

    return () => {
      isMounted = false;
    };
  }, [channelId]);

  return {
    channel,
    channelId,
    errorMessage: bootstrapErrorMessage || channelErrorMessage,
    isLoading: isBootstrapping || isResolvingChannel,
  };
}
