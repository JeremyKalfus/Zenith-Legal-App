import { createStreamChatClientManager } from '@zenith/shared';
import type { StreamChat } from 'stream-chat';
import { env } from '../config/env';

const streamChatClientManager = createStreamChatClientManager(() => env.streamApiKey);

export const getChatClient = (): StreamChat => streamChatClientManager.getChatClient();

export const ensureChatUserConnected = async (
  user: {
    id: string;
    name?: string;
    image?: string;
  },
  token: string,
): Promise<StreamChat> => streamChatClientManager.ensureChatUserConnected(user, token);

export const disconnectChatClient = async (): Promise<void> =>
  streamChatClientManager.disconnectChatClient();
