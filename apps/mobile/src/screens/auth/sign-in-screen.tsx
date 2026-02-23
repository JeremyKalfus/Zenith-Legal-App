import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PasswordInput } from '../../components/password-input';
import { useAuth } from '../../context/auth-context';
import { authRedirectUrl } from '../../lib/supabase';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';

export function SignInScreen({ onBack }: { onBack: () => void }) {
  const {
    authConfigError,
    authNotice,
    clearAuthNotice,
    needsPasswordReset,
    requestPasswordReset,
    signInWithEmailPassword,
    updatePassword,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (needsPasswordReset) {
    return (
      <SafeAreaView
        style={[styles.safeArea, Platform.OS === 'web' ? styles.safeAreaWeb : null]}
        edges={['top', 'bottom']}
      >
        <View style={Platform.OS === 'web' ? styles.webFrame : undefined}>
          <GlobalRecruiterBanner />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.container}>
            <Text style={styles.title}>Set a new password</Text>
            <Text style={styles.body}>
              Your reset link is valid. Enter a new password to continue.
            </Text>

            {authConfigError ? <Text style={styles.error}>{authConfigError}</Text> : null}
            {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}

            <PasswordInput
              placeholder="New password"
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              showStrength
            />
            <PasswordInput
              placeholder="Confirm new password"
              style={styles.input}
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
            />

            <Pressable
              style={[styles.button, (busy || !newPassword || !confirmNewPassword) && styles.buttonDisabled]}
              disabled={busy || !newPassword || !confirmNewPassword}
              accessibilityState={{ disabled: busy || !newPassword || !confirmNewPassword }}
              onPress={async () => {
                setBusy(true);
                setMessage('');
                clearAuthNotice();
                try {
                  if (newPassword !== confirmNewPassword) {
                    throw new Error('Passwords do not match');
                  }
                  await updatePassword(newPassword);
                  setMessage('Password updated successfully.');
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Text style={styles.buttonText}>{busy ? 'Updating password...' : 'Update password'}</Text>
            </Pressable>

            {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, Platform.OS === 'web' ? styles.safeAreaWeb : null]}
      edges={['top', 'bottom']}
    >
      <View style={Platform.OS === 'web' ? styles.webFrame : undefined}>
        <GlobalRecruiterBanner />
        <ScrollView contentContainerStyle={styles.signInScrollContent}>
          <View style={[styles.container, styles.centeredContainer]}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.body}>Sign in with your email address and password.</Text>

          {authConfigError ? <Text style={styles.error}>{authConfigError}</Text> : null}
          {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}

          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />

          <PasswordInput
            placeholder="Password"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />

          <Pressable
            style={[styles.button, (busy || !email.trim() || !password) && styles.buttonDisabled]}
            disabled={busy || !email.trim() || !password}
            accessibilityState={{ disabled: busy || !email.trim() || !password }}
            onPress={async () => {
              setBusy(true);
              setMessage('');
              clearAuthNotice();
              try {
                await signInWithEmailPassword(email, password);
                setMessage('Signing in...');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.buttonText}>Sign in with email</Text>
          </Pressable>

          <Pressable
            style={styles.linkButton}
            disabled={busy || !email.trim()}
            accessibilityState={{ disabled: busy || !email.trim() }}
            onPress={async () => {
              setBusy(true);
              setMessage('');
              clearAuthNotice();
              try {
                await requestPasswordReset(email);
                const redirectHint =
                  __DEV__ && authRedirectUrl?.startsWith('exp://')
                    ? ` Reset callback: ${authRedirectUrl}`
                    : '';
                setMessage(
                  `Password reset link sent to your email. Open it on this device.${redirectHint}`,
                );
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
          <Text style={styles.linkText}>Forgot password? Send reset email</Text>
          </Pressable>

          {__DEV__ && authRedirectUrl?.startsWith('exp://') ? (
            <Text style={styles.devNote}>
              Dev note: Supabase password recovery does not honor Expo Go exp:// callbacks. Use a
              development build (zenithlegal://auth/callback) for mobile password reset.
            </Text>
          ) : null}

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable onPress={onBack} style={styles.linkButton}>
            <Text style={styles.linkText}>New candidate? Start intake</Text>
          </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#475569',
    marginBottom: 16,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 10,
    marginBottom: 10,
    padding: 12,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  container: {
    gap: 8,
    padding: 16,
  },
  error: {
    color: '#B91C1C',
    fontSize: 12,
    marginTop: -2,
  },
  devNote: {
    color: '#92400E',
    fontSize: 12,
    marginTop: -2,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
  },
  linkButton: {
    marginTop: 8,
  },
  linkText: {
    color: '#0F766E',
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    color: '#0F172A',
    marginTop: 8,
  },
  safeArea: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  safeAreaWeb: {
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  signInScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  title: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '700',
  },
  webFrame: {
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 1100,
    overflow: 'hidden',
    width: '67%',
  },
  centeredContainer: {
    justifyContent: 'center',
  },
});
