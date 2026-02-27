import { StreamChat } from 'stream-chat';

export type StreamChatUser = {
  id: string;
  name?: string;
  image?: string;
};

export function createStreamChatClientManager(getApiKey: () => string) {
  let chatClient: StreamChat | null = null;

  function getChatClient(): StreamChat {
    if (!chatClient) {
      chatClient = StreamChat.getInstance(getApiKey());
    }
    return chatClient;
  }

  async function ensureChatUserConnected(user: StreamChatUser, token: string): Promise<StreamChat> {
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

  async function disconnectChatClient(): Promise<void> {
    if (!chatClient) {
      return;
    }
    await chatClient.disconnectUser();
    chatClient = null;
  }

  return {
    getChatClient,
    ensureChatUserConnected,
    disconnectChatClient,
  };
}
