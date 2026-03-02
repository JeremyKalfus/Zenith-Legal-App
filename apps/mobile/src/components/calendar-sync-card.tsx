import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/auth-context';
import { getFunctionErrorMessage } from '../lib/function-error';
import { ensureValidSession, supabase } from '../lib/supabase';
import { uiColors } from '../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../theme/pressable';

type CalendarProvider = 'apple';
type MessageTone = 'info' | 'error' | 'success';

type CalendarConnectionRow = {
  provider: CalendarProvider;
  sync_state: Record<string, unknown> | null;
  updated_at: string | null;
};

function getProviderStateLabel(connection: CalendarConnectionRow | null): string {
  if (!connection) {
    return 'Not connected';
  }

  const stateValue = connection.sync_state?.state;
  const state = typeof stateValue === 'string' ? stateValue : '';

  if (state === 'synced' || state === 'connected') {
    return 'Connected';
  }
  if (state === 'connected_pending_exchange') {
    return 'Connected (pending token exchange)';
  }
  if (state === 'connected_missing_access_token') {
    return 'Connected (limited mode)';
  }
  if (state === 'sync_failed') {
    return 'Sync issue (reconnect recommended)';
  }
  if (!state) {
    return 'Connected';
  }

  return state.replace(/_/g, ' ');
}

export function CalendarSyncCard({
  embedded = false,
  hideHeader = false,
}: {
  embedded?: boolean;
  hideHeader?: boolean;
} = {}) {
  const { session } = useAuth();
  const [connection, setConnection] = useState<CalendarConnectionRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('info');

  const refreshConnections = useCallback(async () => {
    if (!session?.user.id) {
      setConnection(null);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('calendar_connections')
      .select('provider,sync_state,updated_at')
      .eq('user_id', session.user.id)
      .eq('provider', 'apple')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setMessageTone('error');
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setConnection((data as CalendarConnectionRow | null) ?? null);
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  const handleConnectApple = useCallback(async () => {
    setBusy(true);
    setMessage('');

    try {
      await ensureValidSession();
      const { error } = await supabase.functions.invoke('connect_calendar_provider', {
        body: {
          provider: 'apple',
          oauth_tokens: {
            mode: 'ics_data_url',
            connected_via: 'mobile_profile_settings',
            connected_at: new Date().toISOString(),
          },
        },
      });
      if (error) {
        throw error;
      }

      setMessageTone('success');
      setMessage('Apple Calendar connected.');
      await refreshConnections();
    } catch (error) {
      const readable = await getFunctionErrorMessage(
        error,
        'Unable to connect Apple Calendar.',
      );
      setMessageTone('error');
      setMessage(readable);
    } finally {
      setBusy(false);
    }
  }, [refreshConnections]);

  return (
    <View style={embedded ? styles.embeddedContent : styles.card}>
      {!hideHeader ? <Text style={styles.sectionTitle}>Calendar Sync</Text> : null}
      {!hideHeader ? (
        <Text style={styles.helper}>
          Connect Apple calendar to sync scheduled appointments and updates.
        </Text>
      ) : null}

      <View style={styles.providerRow}>
        <View style={styles.providerCopy}>
          <Text style={styles.providerTitle}>Apple Calendar</Text>
          <Text style={styles.providerStatus}>
            Status: {getProviderStateLabel(connection)}
          </Text>
        </View>
        <Pressable
          style={interactivePressableStyle({
            base: styles.secondaryButton,
            disabled: busy,
            disabledStyle: styles.buttonDisabled,
            hoverStyle: sharedPressableFeedback.hover,
            focusStyle: sharedPressableFeedback.focus,
            pressedStyle: sharedPressableFeedback.pressed,
          })}
          onPress={() => {
            void handleConnectApple();
          }}
          disabled={busy}
        >
          <Text style={styles.secondaryButtonText}>
            {busy ? 'Connecting...' : 'Connect'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={interactivePressableStyle({
          base: styles.refreshButton,
          disabled: loading,
          disabledStyle: styles.buttonDisabled,
          hoverStyle: sharedPressableFeedback.hover,
          focusStyle: sharedPressableFeedback.focus,
          pressedStyle: sharedPressableFeedback.pressed,
        })}
        onPress={() => {
          void refreshConnections();
        }}
        disabled={loading}
      >
        <Text style={styles.refreshButtonText}>
          {loading ? 'Refreshing...' : 'Refresh calendar status'}
        </Text>
      </Pressable>

      {message ? (
        <Text
          style={[
            styles.message,
            messageTone === 'error'
              ? styles.messageError
              : messageTone === 'success'
                ? styles.messageSuccess
                : null,
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  embeddedContent: {
    gap: 10,
  },
  helper: {
    color: uiColors.textMuted,
    fontSize: 12,
  },
  message: {
    color: uiColors.textPrimary,
    fontSize: 13,
  },
  messageError: {
    color: uiColors.error,
  },
  messageSuccess: {
    color: uiColors.success,
  },
  providerCopy: {
    flex: 1,
    gap: 2,
  },
  providerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  providerStatus: {
    color: uiColors.textSecondary,
    fontSize: 12,
  },
  providerTitle: {
    color: uiColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: uiColors.divider,
    borderRadius: 10,
    padding: 10,
  },
  refreshButtonText: {
    color: uiColors.textPrimary,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: uiColors.divider,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: uiColors.textPrimary,
    fontWeight: '700',
  },
  sectionTitle: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
