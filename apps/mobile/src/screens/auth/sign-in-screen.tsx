import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth-context';
import { useSendCooldown } from '../../hooks/use-send-cooldown';

export function SignInScreen({ onBack }: { onBack: () => void }) {
  const {
    authConfigError,
    authMethods,
    authMethodsError,
    authNotice,
    clearAuthNotice,
    isRefreshingAuthMethods,
    refreshAuthMethods,
    sendEmailMagicLink,
    sendSmsOtp,
    verifySmsOtp,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const emailCooldown = useSendCooldown(60);
  const smsExplicitlyDisabled = authMethods.smsOtpStatus === 'disabled';
  const smsAvailabilityUnknown = authMethods.smsOtpStatus === 'unknown';
  const smsSendDisabled = busy || !phone || smsExplicitlyDisabled;
  const smsVerifyDisabled = busy || otp.length < 4 || !phone || smsExplicitlyDisabled;
  const smsButtonLabel = smsExplicitlyDisabled ? 'SMS sign-in unavailable' : 'Send SMS code';

  const authMethodsStatusMessage = useMemo(() => {
    if (authMethodsError) {
      return authMethodsError;
    }
    if (isRefreshingAuthMethods && authMethods.lastCheckedAt === null) {
      return 'Checking email/SMS sign-in availability...';
    }
    if (smsAvailabilityUnknown) {
      return 'SMS availability could not be confirmed yet. You can still try sending an SMS code.';
    }
    return null;
  }, [
    authMethods.lastCheckedAt,
    authMethodsError,
    isRefreshingAuthMethods,
    smsAvailabilityUnknown,
  ]);

  useEffect(() => {
    void refreshAuthMethods();
  }, [refreshAuthMethods]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.body}>Use the same email or mobile number from your prior login.</Text>

          {authConfigError ? <Text style={styles.error}>{authConfigError}</Text> : null}
          {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}
          {authMethodsStatusMessage ? (
            <Text style={authMethodsError ? styles.error : styles.helper}>{authMethodsStatusMessage}</Text>
          ) : null}
          {authMethodsError ? (
            <Pressable
              style={styles.retryLinkButton}
              onPress={() => void refreshAuthMethods()}
              disabled={isRefreshingAuthMethods}
              accessibilityState={{ disabled: isRefreshingAuthMethods }}
            >
              <Text style={styles.retryLinkText}>
                {isRefreshingAuthMethods ? 'Retrying availability check...' : 'Retry availability check'}
              </Text>
            </Pressable>
          ) : null}

          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <Pressable
            style={[
              styles.button,
              (busy || !email || !authMethods.emailOtpEnabled || emailCooldown.isCoolingDown) &&
                styles.buttonDisabled,
            ]}
            disabled={busy || !email || !authMethods.emailOtpEnabled || emailCooldown.isCoolingDown}
            accessibilityState={{
              disabled: busy || !email || !authMethods.emailOtpEnabled || emailCooldown.isCoolingDown,
            }}
            onPress={async () => {
              setBusy(true);
              clearAuthNotice();
              try {
                await sendEmailMagicLink(email.trim(), { shouldCreateUser: false });
                emailCooldown.startCooldown();
                setMessage('Magic link sent. Open it on this device to sign in.');
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

          <TextInput
            keyboardType="phone-pad"
            placeholder="Mobile number"
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
          />
          <Pressable
            style={[styles.buttonSecondary, smsSendDisabled && styles.buttonSecondaryDisabled]}
            disabled={smsSendDisabled}
            accessibilityState={{ disabled: smsSendDisabled }}
            onPress={async () => {
              setBusy(true);
              clearAuthNotice();
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
              {smsButtonLabel}
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
            style={[styles.button, smsVerifyDisabled && styles.buttonDisabled]}
            disabled={smsVerifyDisabled}
            accessibilityState={{ disabled: smsVerifyDisabled }}
            onPress={async () => {
              setBusy(true);
              clearAuthNotice();
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
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
  },
  helper: {
    color: '#475569',
    fontSize: 12,
    marginTop: -2,
  },
  linkButton: {
    marginTop: 8,
  },
  linkText: {
    color: '#0F766E',
    fontWeight: '600',
    textAlign: 'center',
  },
  retryLinkButton: {
    marginTop: -2,
    marginBottom: 6,
  },
  retryLinkText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '600',
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
