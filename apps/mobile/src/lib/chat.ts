import { StreamChat } from 'stream-chat';
import { env } from '../config/env';

let chatClient: StreamChat | null = null;

export function getChatClient(): StreamChat {
  if (!chatClient) {
    chatClient = StreamChat.getInstance(env.streamApiKey);
  }

  return chatClient;
}

export async function disconnectChatClient(): Promise<void> {
  if (chatClient) {
    await chatClient.disconnectUser();
    chatClient = null;
  }
}
