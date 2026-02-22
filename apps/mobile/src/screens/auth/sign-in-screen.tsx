import { normalizePhoneNumber, PHONE_VALIDATION_MESSAGES, sanitizePhoneInput } from '@zenith/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth-context';

export function SignInScreen({ onBack }: { onBack: () => void }) {
  const {
    authConfigError,
    authNotice,
    clearAuthNotice,
    needsPasswordReset,
    requestPasswordReset,
    signInWithEmailPassword,
    signInWithPhonePassword,
    updatePassword,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function normalizePhoneInputOrThrow(input: string): string {
    const normalized = normalizePhoneNumber(input);
    if (!normalized.ok) {
      throw new Error(PHONE_VALIDATION_MESSAGES.invalidMobileForAuth);
    }

    return normalized.e164;
  }

  if (needsPasswordReset) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.container}>
            <Text style={styles.title}>Set a new password</Text>
            <Text style={styles.body}>
              Your reset link is valid. Enter a new password to continue.
            </Text>

            {authConfigError ? <Text style={styles.error}>{authConfigError}</Text> : null}
            {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}

            <TextInput
              secureTextEntry
              placeholder="New password"
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              secureTextEntry
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.body}>Use the same email or mobile number from your prior login.</Text>

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

          <TextInput
            keyboardType="phone-pad"
            placeholder="Mobile number"
            style={styles.input}
            value={phone}
            onChangeText={(value) => setPhone(sanitizePhoneInput(value))}
            onBlur={() => {
              const normalized = normalizePhoneNumber(phone);
              if (normalized.ok) {
                setPhone(normalized.e164);
              }
            }}
          />
          <Text style={styles.helper}>US numbers can be entered without +1.</Text>

          <TextInput
            secureTextEntry
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
            style={[styles.buttonSecondary, (busy || !phone.trim() || !password) && styles.buttonSecondaryDisabled]}
            disabled={busy || !phone.trim() || !password}
            accessibilityState={{ disabled: busy || !phone.trim() || !password }}
            onPress={async () => {
              setBusy(true);
              setMessage('');
              clearAuthNotice();
              try {
                const normalizedPhone = normalizePhoneInputOrThrow(phone);
                setPhone(normalizedPhone);
                await signInWithPhonePassword(normalizedPhone, password);
                setMessage('Signing in...');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.buttonTextSecondary}>Sign in with mobile</Text>
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
                setMessage('Password reset link sent to your email. Open it on this device.');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.linkText}>Forgot password? Send reset email</Text>
          </Pressable>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable onPress={onBack} style={styles.linkButton}>
            <Text style={styles.linkText}>New candidate? Start intake</Text>
          </Pressable>
        </View>
      </ScrollView>
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
  buttonSecondary: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    marginBottom: 10,
    padding: 12,
  },
  buttonSecondaryDisabled: {
    backgroundColor: '#E2E8F0',
    opacity: 0.65,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#0F172A',
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
  helper: {
    color: '#475569',
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
  scrollContent: {
    paddingBottom: 24,
  },
  title: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '700',
  },
});
