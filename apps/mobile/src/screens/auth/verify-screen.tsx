import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth-context';
import { useSendCooldown } from '../../hooks/use-send-cooldown';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';

export function VerifyScreen() {
  const {
    intakeDraft,
    authMethods,
    authMethodsError,
    authConfigError,
    authNotice,
    clearAuthNotice,
    isRefreshingAuthMethods,
    refreshAuthMethods,
    sendEmailMagicLink,
    sendSmsOtp,
    verifySmsOtp,
  } = useAuth();
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const emailCooldown = useSendCooldown(60);
  const hasMobileForSms = !!intakeDraft?.mobile;
  const smsExplicitlyDisabled = authMethods.smsOtpStatus === 'disabled';
  const smsAvailabilityUnknown = authMethods.smsOtpStatus === 'unknown';
  const smsSendDisabled = busy || smsExplicitlyDisabled || !hasMobileForSms;
  const smsVerifyDisabled = busy || otp.length < 4 || smsExplicitlyDisabled || !hasMobileForSms;
  const smsButtonLabel = !hasMobileForSms
    ? 'SMS requires mobile at sign-up'
    : smsExplicitlyDisabled
      ? 'SMS sign-in unavailable'
      : 'Send SMS code';

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

  if (!intakeDraft) {
    return (
      <SafeAreaView
        style={[styles.safeArea, Platform.OS === 'web' ? styles.safeAreaWeb : null]}
        edges={['top', 'bottom']}
      >
        <View style={Platform.OS === 'web' ? styles.webFrame : undefined}>
          <GlobalRecruiterBanner />
          <View style={styles.container}>
            <Text style={styles.title}>Missing intake data.</Text>
          </View>
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.container}>
          <Text style={styles.title}>Verify your identity</Text>
          <Text style={styles.body}>
            Use email magic link or SMS OTP. You only need one method.
          </Text>
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

          <Pressable
            style={interactivePressableStyle({
              base: styles.button,
              disabled: busy || !authMethods.emailOtpEnabled || emailCooldown.isCoolingDown,
              disabledStyle: styles.buttonDisabled,
              hoverStyle: sharedPressableFeedback.hover,
              focusStyle: sharedPressableFeedback.focus,
              pressedStyle: sharedPressableFeedback.pressed,
            })}
            disabled={busy || !authMethods.emailOtpEnabled || emailCooldown.isCoolingDown}
            accessibilityState={{
              disabled: busy || !authMethods.emailOtpEnabled || emailCooldown.isCoolingDown,
            }}
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
            style={[styles.buttonSecondary, smsSendDisabled && styles.buttonSecondaryDisabled]}
            disabled={smsSendDisabled}
            accessibilityState={{ disabled: smsSendDisabled }}
            onPress={async () => {
              setBusy(true);
              clearAuthNotice();
              try {
                if (!intakeDraft.mobile) {
                  throw new Error('Add a mobile number during sign-up to use SMS verification.');
                }
                await sendSmsOtp(intakeDraft.mobile);
                setMessage('SMS code sent. Enter it below.');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.buttonTextSecondary}>{smsButtonLabel}</Text>
          </Pressable>

          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            placeholder="Enter SMS code"
          />
          <Text style={styles.helper}>
            {hasMobileForSms
              ? 'Enter the SMS code only (not your phone number).'
              : 'SMS verification is unavailable because no mobile number was provided.'}
          </Text>
          <Pressable
            style={interactivePressableStyle({
              base: styles.button,
              disabled: smsVerifyDisabled,
              disabledStyle: styles.buttonDisabled,
              hoverStyle: sharedPressableFeedback.hover,
              focusStyle: sharedPressableFeedback.focus,
              pressedStyle: sharedPressableFeedback.pressed,
            })}
            disabled={smsVerifyDisabled}
            accessibilityState={{ disabled: smsVerifyDisabled }}
            onPress={async () => {
              setBusy(true);
              clearAuthNotice();
              try {
                if (!intakeDraft.mobile) {
                  throw new Error('Add a mobile number during sign-up to use SMS verification.');
                }
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
    backgroundColor: uiColors.primary,
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
    color: uiColors.primaryText,
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
  retryLinkButton: {
    marginTop: -2,
    marginBottom: 6,
  },
  retryLinkText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '700',
  },
  webFrame: {
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 16,
    borderWidth: 1,
    boxShadow: '0px 8px 24px rgba(15, 23, 42, 0.06)',
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 1100,
    overflow: 'hidden',
    width: '100%',
    minWidth: 320,
  },
});
