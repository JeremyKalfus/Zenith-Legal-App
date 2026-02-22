import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth-context';

export function SignInScreen({ onBack }: { onBack: () => void }) {
  const { authConfigError, authMethods, sendEmailMagicLink, sendSmsOtp, verifySmsOtp } =
    useAuth();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.body}>Use the same email or mobile number from your prior login.</Text>

          {authConfigError ? <Text style={styles.error}>{authConfigError}</Text> : null}

          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <Pressable
            style={styles.button}
            disabled={busy || !email || !authMethods.emailOtpEnabled}
            onPress={async () => {
              setBusy(true);
              try {
                await sendEmailMagicLink(email.trim(), { shouldCreateUser: false });
                setMessage('Magic link sent. Open it on this device to sign in.');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.buttonText}>
              {authMethods.emailOtpEnabled ? 'Send email magic link' : 'Email sign-in unavailable'}
            </Text>
          </Pressable>

          <TextInput
            keyboardType="phone-pad"
            placeholder="Mobile number"
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
          />
          <Pressable
            style={styles.buttonSecondary}
            disabled={busy || !phone || !authMethods.smsOtpEnabled}
            onPress={async () => {
              setBusy(true);
              try {
                await sendSmsOtp(phone.trim(), { shouldCreateUser: false });
                setMessage('SMS code sent. Enter it below.');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.buttonTextSecondary}>
              {authMethods.smsOtpEnabled ? 'Send SMS code' : 'SMS sign-in unavailable'}
            </Text>
          </Pressable>

          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            placeholder="Enter SMS code"
          />
          <Pressable
            style={styles.button}
            disabled={busy || otp.length < 4 || !phone || !authMethods.smsOtpEnabled}
            onPress={async () => {
              setBusy(true);
              try {
                await verifySmsOtp(phone.trim(), otp.trim());
                setMessage('Phone verified. You are now signed in.');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.buttonText}>Verify SMS code</Text>
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
  buttonSecondary: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    marginBottom: 10,
    padding: 12,
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
