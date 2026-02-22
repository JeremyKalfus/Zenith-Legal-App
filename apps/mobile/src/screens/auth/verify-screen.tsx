import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth-context';
import { useSendCooldown } from '../../hooks/use-send-cooldown';

export function VerifyScreen() {
  const {
    intakeDraft,
    authMethods,
    authConfigError,
    authNotice,
    clearAuthNotice,
    sendEmailMagicLink,
    sendSmsOtp,
    verifySmsOtp,
  } = useAuth();
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const emailCooldown = useSendCooldown(60);

  if (!intakeDraft) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <Text style={styles.title}>Missing intake data.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.title}>Verify your identity</Text>
          <Text style={styles.body}>
            Use email magic link or SMS OTP. You only need one method.
          </Text>
          {authConfigError ? <Text style={styles.error}>{authConfigError}</Text> : null}
          {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}

          <Pressable
            style={styles.button}
            disabled={busy || !authMethods.emailOtpEnabled || emailCooldown.isCoolingDown}
            onPress={async () => {
              setBusy(true);
              clearAuthNotice();
              try {
                await sendEmailMagicLink(intakeDraft.email);
                emailCooldown.startCooldown();
                setMessage('Magic link sent to your email. Open it on this device.');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.buttonText}>
              {!authMethods.emailOtpEnabled
                ? 'Email sign-in unavailable'
                : emailCooldown.isCoolingDown
                  ? `Resend in ${emailCooldown.remainingSeconds}s`
                  : 'Send email magic link'}
            </Text>
          </Pressable>

      <Pressable
        style={styles.buttonSecondary}
        disabled={busy || !authMethods.smsOtpEnabled}
        onPress={async () => {
          setBusy(true);
          clearAuthNotice();
          try {
            await sendSmsOtp(intakeDraft.mobile);
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
        disabled={busy || otp.length < 4 || !authMethods.smsOtpEnabled}
        onPress={async () => {
          setBusy(true);
          clearAuthNotice();
          try {
            await verifySmsOtp(intakeDraft.mobile, otp);
            setMessage('Phone verified successfully.');
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
  safeArea: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
  },
  message: {
    color: '#0F172A',
    marginTop: 8,
  },
  title: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '700',
  },
});
