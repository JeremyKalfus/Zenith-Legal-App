import { useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PasswordInput } from '../../components/password-input';
import { useAuth } from '../../context/auth-context';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';

type AuthTab = 'signup' | 'login';

export function AuthMenuScreen({
  onContinueSignup,
}: {
  onContinueSignup?: (email: string) => void;
}) {
  const {
    authConfigError,
    authNotice,
    checkCandidateSignupEmailAvailability,
    clearAuthNotice,
    requestPasswordReset,
    signInWithEmailPassword,
  } = useAuth();
  const [tab, setTab] = useState<AuthTab>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const isSignup = tab === 'signup';
  const logoSize = 211;
  const normalizedEmail = email.trim().toLowerCase();
  const ctaDisabled = isSignup ? busy || !normalizedEmail : busy || !normalizedEmail || !password;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.center}>
        <Image
          source={require('../../../assets/zenith-legal-logo.png')}
          style={[styles.brandLogo, { height: logoSize, width: logoSize }]}
          resizeMode="contain"
        />
        <Text style={styles.title}>Zenith Legal</Text>
        <Text style={styles.subtitle}>A HIGHER LEVEL OF LEGAL SEARCH</Text>

        <View style={styles.card}>
          <View style={styles.tabRow}>
            <Pressable
              style={[
                styles.tabButton,
                tab === 'signup' ? styles.tabButtonActive : null,
              ]}
              onPress={() => {
                setTab('signup');
                setMessage('');
                clearAuthNotice();
              }}
            >
              <Text style={[styles.tabText, tab === 'signup' ? styles.tabTextActive : null]}>Sign Up</Text>
            </Pressable>
            <Pressable
              style={[
                styles.tabButton,
                tab === 'login' ? styles.tabButtonActive : null,
              ]}
              onPress={() => {
                setTab('login');
                setMessage('');
                clearAuthNotice();
              }}
            >
              <Text style={[styles.tabText, tab === 'login' ? styles.tabTextActive : null]}>Log In</Text>
            </Pressable>
          </View>

          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />

          {!isSignup ? (
            <PasswordInput
              placeholder="Password"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
            />
          ) : null}

          <Pressable
            style={interactivePressableStyle({
              base: styles.cta,
              disabled: ctaDisabled,
              disabledStyle: styles.ctaDisabled,
              hoverStyle: sharedPressableFeedback.hover,
              focusStyle: sharedPressableFeedback.focus,
              pressedStyle: sharedPressableFeedback.pressed,
            })}
            disabled={ctaDisabled}
            accessibilityState={{ disabled: ctaDisabled }}
            onPress={async () => {
              setBusy(true);
              setMessage('');
              clearAuthNotice();
              try {
                if (isSignup) {
                  await checkCandidateSignupEmailAvailability(normalizedEmail);
                  onContinueSignup?.(normalizedEmail);
                } else {
                  await signInWithEmailPassword(normalizedEmail, password);
                  setMessage('Signing in...');
                }
              } catch (error) {
                const nextMessage = (error as Error).message;
                setMessage(nextMessage);
                if (isSignup && nextMessage.toLowerCase().includes('already exists')) {
                  setTab('login');
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.ctaText}>
              {busy
                ? isSignup
                  ? 'Checking email...'
                  : 'Logging in...'
                : isSignup
                  ? 'Continue'
                  : 'Log in'}
            </Text>
          </Pressable>

          {!isSignup ? (
            <Pressable
              style={styles.forgotButton}
              disabled={busy || !email.trim()}
              accessibilityState={{ disabled: busy || !email.trim() }}
              onPress={async () => {
                setBusy(true);
                setMessage('');
                clearAuthNotice();
                try {
                  await requestPasswordReset(email);
                  setMessage('Password reset email sent.');
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          ) : null}

          {authConfigError ? <Text style={styles.error}>{authConfigError}</Text> : null}
          {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brandLogo: {
    marginBottom: 18,
    marginTop: 100,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginTop: 22,
    padding: 14,
    width: '100%',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: -70,
    maxWidth: 560,
    minHeight: 760,
    paddingHorizontal: 16,
    paddingTop: 56,
    width: '100%',
  },
  cta: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: uiColors.primaryText,
    fontSize: 24 / 1.6,
    fontWeight: '700',
  },
  error: {
    color: uiColors.error,
    fontSize: 12,
    textAlign: 'center',
  },
  forgotButton: {
    marginTop: -4,
  },
  forgotText: {
    color: uiColors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  input: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  message: {
    color: uiColors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  safeArea: {
    backgroundColor: '#EFF1F4',
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: 24,
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 24 / 1.6,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tabButton: {
    alignItems: 'center',
    borderColor: uiColors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  tabButtonActive: {
    borderColor: uiColors.primary,
    backgroundColor: uiColors.surface,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabText: {
    color: '#6B7280',
    fontWeight: '700',
  },
  tabTextActive: {
    color: uiColors.textPrimary,
  },
  title: {
    color: uiColors.textPrimary,
    fontSize: 42 / 1.6,
    fontWeight: '700',
    marginBottom: 6,
  },
});
