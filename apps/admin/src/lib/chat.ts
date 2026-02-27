import { createStreamChatClientManager } from '@zenith/shared';
import type { StreamChat } from 'stream-chat';

const streamChatClientManager = createStreamChatClientManager(() => {
  const apiKey = getConfiguredStreamApiKey();
  if (!apiKey) {
    throw new Error(getStreamChatConfigError() ?? 'Stream Chat is not configured.');
  }
  return apiKey;
});

function getConfiguredStreamApiKey(): string | null {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

export function isStreamChatConfigured(): boolean {
  return getConfiguredStreamApiKey() !== null;
}

export function getStreamChatConfigError(): string | null {
  if (isStreamChatConfigured()) {
    return null;
  }

  return 'Missing NEXT_PUBLIC_STREAM_API_KEY for admin messaging.';
}

export function getChatClient(): StreamChat {
  return streamChatClientManager.getChatClient();
}

export async function ensureChatUserConnected(
  user: {
    id: string;
    name?: string;
    image?: string;
  },
  token: string,
): Promise<StreamChat> {
  return streamChatClientManager.ensureChatUserConnected(user, token);
}

export async function disconnectChatClient(): Promise<void> {
  await streamChatClientManager.disconnectChatClient();
}
