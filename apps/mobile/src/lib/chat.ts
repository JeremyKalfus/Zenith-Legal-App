import { StreamChat } from 'stream-chat';
import { env } from '../config/env';

let chatClient: StreamChat | null = null;

export function getChatClient(): StreamChat {
  if (!chatClient) {
    chatClient = StreamChat.getInstance(env.streamApiKey);
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
