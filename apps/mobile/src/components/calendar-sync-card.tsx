import * as AuthSession from 'expo-auth-session';
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/auth-context';
import { env } from '../config/env';
import { getFunctionErrorMessage } from '../lib/function-error';
import { ensureValidSession, supabase } from '../lib/supabase';
import { uiColors } from '../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../theme/pressable';

WebBrowser.maybeCompleteAuthSession();

type CalendarProvider = 'google' | 'apple';
type MessageTone = 'info' | 'error' | 'success';

type CalendarConnectionRow = {
  provider: CalendarProvider;
  sync_state: Record<string, unknown> | null;
  updated_at: string | null;
};

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const GOOGLE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
];

function getGoogleClientIdForPlatform(): string {
  if (Platform.OS === 'web') {
    return env.googleOAuthWebClientId || env.googleOAuthClientId;
  }

  if (Platform.OS === 'ios') {
    return env.googleOAuthIosClientId || env.googleOAuthClientId;
  }

  if (Platform.OS === 'android') {
    return env.googleOAuthAndroidClientId || env.googleOAuthClientId;
  }

  return env.googleOAuthClientId;
}

function buildGoogleRedirectUri(): string {
  if (Platform.OS === 'web') {
    return AuthSession.makeRedirectUri({
      path: 'oauth/google',
      preferLocalhost: true,
    });
  }

  const nativeRedirect = Application.applicationId
    ? `${Application.applicationId}:/oauthredirect`
    : 'zenithlegal://oauth/google';

  return AuthSession.makeRedirectUri({
    native: nativeRedirect,
    scheme: 'zenithlegal',
    path: 'oauth/google',
  });
}

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

export function CalendarSyncCard() {
  const { session } = useAuth();
  const [connections, setConnections] = useState<CalendarConnectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyProvider, setBusyProvider] = useState<CalendarProvider | null>(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('info');

  const googleConnection = useMemo(
    () => connections.find((connection) => connection.provider === 'google') ?? null,
    [connections],
  );
  const appleConnection = useMemo(
    () => connections.find((connection) => connection.provider === 'apple') ?? null,
    [connections],
  );

  const refreshConnections = useCallback(async () => {
    if (!session?.user.id) {
      setConnections([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('calendar_connections')
      .select('provider,sync_state,updated_at')
      .eq('user_id', session.user.id)
      .in('provider', ['google', 'apple'])
      .order('updated_at', { ascending: false });

    if (error) {
      setMessageTone('error');
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = ((data ?? []) as CalendarConnectionRow[]).filter(
      (row) => row.provider === 'google' || row.provider === 'apple',
    );
    setConnections(rows);
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  const handleConnectGoogle = useCallback(async () => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      setMessageTone('error');
      setMessage(
        'Google OAuth is not supported in Expo Go. Use a development build or standalone app.',
      );
      return;
    }

    const googleClientId = getGoogleClientIdForPlatform();
    if (!googleClientId) {
      const missingVar =
        Platform.OS === 'ios'
          ? 'EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID'
          : Platform.OS === 'android'
            ? 'EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID'
            : 'EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID';
      setMessageTone('error');
      setMessage(`Google OAuth is not configured. Set ${missingVar}.`);
      return;
    }

    setBusyProvider('google');
    setMessage('');

    try {
      await ensureValidSession();
      const redirectUri = buildGoogleRedirectUri();
      const request = new AuthSession.AuthRequest({
        clientId: googleClientId,
        redirectUri,
        scopes: GOOGLE_SCOPES,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
        extraParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      });

      const result = await request.promptAsync(GOOGLE_DISCOVERY);
      if (result.type === 'cancel' || result.type === 'dismiss') {
        setMessageTone('info');
        setMessage('Google connection cancelled.');
        return;
      }
      if (result.type === 'error') {
        const detail =
          result.error?.description ??
          result.params.error_description ??
          result.params.error ??
          'Google sign-in failed.';
        setMessageTone('error');
        setMessage(detail);
        return;
      }
      if (result.type !== 'success') {
        setMessageTone('info');
        setMessage('Google connection was not completed.');
        return;
      }

      const authorizationCode = result.params.code;
      if (!authorizationCode) {
        setMessageTone('error');
        setMessage('Google sign-in did not return an authorization code.');
        return;
      }

      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: googleClientId,
          code: authorizationCode,
          redirectUri,
          extraParams: request.codeVerifier
            ? { code_verifier: request.codeVerifier }
            : undefined,
        },
        GOOGLE_DISCOVERY,
      );

      const { error } = await supabase.functions.invoke('connect_calendar_provider', {
        body: {
          provider: 'google',
          oauth_tokens: {
            access_token: tokenResponse.accessToken,
            refresh_token: tokenResponse.refreshToken ?? null,
            expires_in: tokenResponse.expiresIn ?? null,
            token_type: tokenResponse.tokenType ?? null,
            scope: tokenResponse.scope ?? null,
            id_token: tokenResponse.idToken ?? null,
            issued_at: tokenResponse.issuedAt,
            redirect_uri: redirectUri,
          },
        },
      });
      if (error) {
        throw error;
      }

      setMessageTone('success');
      setMessage('Google Calendar connected.');
      await refreshConnections();
    } catch (error) {
      const readable = await getFunctionErrorMessage(
        error,
        'Unable to connect Google Calendar.',
      );
      setMessageTone('error');
      setMessage(readable);
    } finally {
      setBusyProvider(null);
    }
  }, [refreshConnections]);

  const handleConnectApple = useCallback(async () => {
    setBusyProvider('apple');
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
      setBusyProvider(null);
    }
  }, [refreshConnections]);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Calendar Sync</Text>
      <Text style={styles.helper}>
        Connect Google or Apple calendar to sync scheduled appointments and updates.
      </Text>

      <View style={styles.providerRow}>
        <View style={styles.providerCopy}>
          <Text style={styles.providerTitle}>Google Calendar</Text>
          <Text style={styles.providerStatus}>
            Status: {getProviderStateLabel(googleConnection)}
          </Text>
        </View>
        <Pressable
          style={interactivePressableStyle({
            base: styles.secondaryButton,
            disabled: busyProvider === 'google',
            disabledStyle: styles.buttonDisabled,
            hoverStyle: sharedPressableFeedback.hover,
            focusStyle: sharedPressableFeedback.focus,
            pressedStyle: sharedPressableFeedback.pressed,
          })}
          onPress={() => {
            void handleConnectGoogle();
          }}
          disabled={busyProvider === 'google'}
        >
          <Text style={styles.secondaryButtonText}>
            {busyProvider === 'google' ? 'Connecting...' : 'Connect'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.providerRow}>
        <View style={styles.providerCopy}>
          <Text style={styles.providerTitle}>Apple Calendar</Text>
          <Text style={styles.providerStatus}>
            Status: {getProviderStateLabel(appleConnection)}
          </Text>
        </View>
        <Pressable
          style={interactivePressableStyle({
            base: styles.secondaryButton,
            disabled: busyProvider === 'apple',
            disabledStyle: styles.buttonDisabled,
            hoverStyle: sharedPressableFeedback.hover,
            focusStyle: sharedPressableFeedback.focus,
            pressedStyle: sharedPressableFeedback.pressed,
          })}
          onPress={() => {
            void handleConnectApple();
          }}
          disabled={busyProvider === 'apple'}
        >
          <Text style={styles.secondaryButtonText}>
            {busyProvider === 'apple' ? 'Connecting...' : 'Connect'}
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
