import { StreamChat } from 'stream-chat';

let chatClient: StreamChat | null = null;

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
  const apiKey = getConfiguredStreamApiKey();
  if (!apiKey) {
    throw new Error(getStreamChatConfigError() ?? 'Stream Chat is not configured.');
  }

  if (!chatClient) {
    chatClient = StreamChat.getInstance(apiKey);
  }

  return chatClient;
}

export async function ensureChatUserConnected(
  user: {
    id: string;
    name?: string;
    image?: string;
  },
  token: string,
): Promise<StreamChat> {
  const client = getChatClient();

  if (client.userID === user.id) {
    return client;
  }

  if (client.userID && client.userID !== user.id) {
    await client.disconnectUser();
  }

  await client.connectUser(user, token);
  return client;
}

export async function disconnectChatClient(): Promise<void> {
  if (chatClient) {
    await chatClient.disconnectUser();
    chatClient = null;
  }
}
