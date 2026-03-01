import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StaffMessageInboxItem } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { useAuth } from '../../context/auth-context';
import {
  listStaffCandidates,
  type StaffCandidateListItem,
} from '../../features/staff-candidate-management';
import { ensureChatUserConnected, getChatClient } from '../../lib/chat';
import { getFunctionErrorMessage } from '../../lib/function-error';
import { ensureValidSession, supabase } from '../../lib/supabase';
import { uiColors } from '../../theme/colors';

type ChatBootstrapResponse = {
  token: string;
  channel_id?: string;
  user_name: string;
  user_image?: string;
};

function deriveDisplayName(candidate: StaffCandidateListItem): string {
  return candidate.name?.trim() || candidate.email.trim();
}

export function StaffNewConversationScreen({
  onOpenConversation,
}: {
  onOpenConversation: (conversation: StaffMessageInboxItem) => void;
}) {
  const { profile, session } = useAuth();
  const [candidates, setCandidates] = useState<StaffCandidateListItem[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listStaffCandidates();
      setCandidates(rows);
      setMessage(null);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const filteredCandidates = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) {
      return candidates;
    }

    return candidates.filter((candidate) => {
      const name = candidate.name?.toLowerCase() ?? '';
      const email = candidate.email.toLowerCase();
      const mobile = candidate.mobile?.toLowerCase() ?? '';
      return name.includes(search) || email.includes(search) || mobile.includes(search);
    });
  }, [candidates, query]);

  const handleStartConversation = useCallback(
    async (candidate: StaffCandidateListItem) => {
      if (!session?.user?.id || !profile) {
        setMessage('Unable to start conversation. Please sign in again.');
        return;
      }

      setBusyCandidateId(candidate.id);
      setMessage(null);

      try {
        await ensureValidSession();
        const { data, error } = await supabase.functions.invoke('chat_auth_bootstrap', {
          body: { user_id: candidate.id },
        });

        if (error) {
          throw new Error(await getFunctionErrorMessage(error));
        }

        const response = data as ChatBootstrapResponse;
        if (!response.channel_id) {
          throw new Error('Unable to resolve conversation channel.');
        }

        await ensureChatUserConnected(
          {
            id: session.user.id,
            name: response.user_name || profile.name || undefined,
            image: response.user_image,
          },
          response.token,
        );

        const client = getChatClient();
        const channel = client.channel('messaging', response.channel_id);
        await channel.watch();
        const channelData = (channel.data ?? {}) as Record<string, unknown>;
        const resolvedChannelName =
          typeof channelData.name === 'string' ? channelData.name.trim() : '';

        const channelName =
          resolvedChannelName.length > 0
            ? resolvedChannelName
            : `${deriveDisplayName(candidate)} · Zenith Legal`;

        onOpenConversation({
          candidateUserId: candidate.id,
          candidateDisplayName: candidate.name,
          channelId: response.channel_id,
          channelName,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: 'Start a conversation',
          unreadCount: 0,
        });
      } catch (error) {
        setMessage(
          await getFunctionErrorMessage(error, 'Unable to start conversation. Please try again.'),
        );
      } finally {
        setBusyCandidateId(null);
      }
    },
    [onOpenConversation, profile, session?.user?.id],
  );

  return (
    <ScreenShell showBanner={false}>
      <Text style={styles.body}>Pick a candidate to start or open a conversation.</Text>

      <TextInput
        autoCapitalize="none"
        placeholder="Search candidates"
        placeholderTextColor={uiColors.textPlaceholder}
        style={styles.input}
        value={query}
        onChangeText={setQuery}
      />

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <View style={styles.list}>
        {isLoading ? (
          <Text style={styles.emptyText}>Loading candidates...</Text>
        ) : filteredCandidates.length === 0 ? (
          <Text style={styles.emptyText}>No candidates found.</Text>
        ) : (
          filteredCandidates.map((candidate) => {
            const isBusy = busyCandidateId === candidate.id;

            return (
              <Pressable
                key={candidate.id}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
                onPress={() => void handleStartConversation(candidate)}
                disabled={Boolean(busyCandidateId)}
              >
                <Text style={styles.cardTitle}>{deriveDisplayName(candidate)}</Text>
                <Text style={styles.cardText}>{candidate.email}</Text>
                <Text style={styles.cardSubtle}>{candidate.mobile || 'No mobile on file'}</Text>
                {isBusy ? <Text style={styles.busyText}>Opening conversation...</Text> : null}
              </Pressable>
            );
          })
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    color: uiColors.textSecondary,
  },
  busyText: {
    color: uiColors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardPressed: {
    backgroundColor: uiColors.background,
  },
  cardSubtle: {
    color: uiColors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  cardText: {
    color: uiColors.textStrong,
    marginTop: 2,
  },
  cardTitle: {
    color: uiColors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: uiColors.textMuted,
    padding: 12,
    textAlign: 'center',
  },
  error: {
    color: uiColors.error,
    fontSize: 13,
  },
  input: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: uiColors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: {
    gap: 10,
  },
});
