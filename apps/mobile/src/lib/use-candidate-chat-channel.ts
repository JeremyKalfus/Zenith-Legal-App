import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { getFunctionErrorMessage } from './function-error';
import { ensureChatUserConnected } from './chat';
import { ensureValidSession, supabase } from './supabase';

type ChatBootstrapResponse = {
  token: string;
  channel_id?: string;
  user_name: string;
  user_image?: string;
};

export function useCandidateChatChannel(candidateUserId?: string) {
  const { session, profile } = useAuth();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const connectedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      if (!session?.user || !profile) {
        setIsLoading(false);
        return;
      }

      try {
        await ensureValidSession();
        const { data, error } = await supabase.functions.invoke('chat_auth_bootstrap', {
          body: { user_id: candidateUserId ?? session.user.id },
        });

        if (error) {
          const message = await getFunctionErrorMessage(
            error,
            'Unable to connect to chat. Please try again.',
          );
          if (isMounted) {
            setErrorMessage(message);
          }
          return;
        }

        const response = data as ChatBootstrapResponse;
        if (!response.channel_id) {
          if (isMounted) {
            setErrorMessage('Unable to load chat channel.');
          }
          return;
        }

        if (!connectedRef.current) {
          await ensureChatUserConnected(
            {
              id: session.user.id,
              name: response.user_name || profile.name || undefined,
              image: response.user_image,
            },
            response.token,
          );
          connectedRef.current = true;
        }

        if (isMounted) {
          setChannelId(response.channel_id);
          setErrorMessage('');
        }
      } catch (error) {
        if (isMounted) {
          const message = await getFunctionErrorMessage(
            error,
            'Unable to connect to chat. Please try again.',
          );
          setErrorMessage(message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [candidateUserId, profile, session?.user]);

  return { channelId, errorMessage, isLoading };
}
