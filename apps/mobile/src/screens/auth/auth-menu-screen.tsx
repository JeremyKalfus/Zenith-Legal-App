import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardEvent,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const ctaAnchorRef = useRef<View | null>(null);
  const forgotAnchorRef = useRef<View | null>(null);
  const scrollYRef = useRef(0);
  const keyboardTopRef = useRef<number>(Number.POSITIVE_INFINITY);
  const keyboardVisibleRef = useRef(false);
  const pendingAnchorScrollRef = useRef(false);
  const queuedScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSignup = tab === 'signup';
  const logoSize = 211;
  const normalizedEmail = email.trim().toLowerCase();
  const ctaDisabled = isSignup ? busy || !normalizedEmail : busy || !normalizedEmail || !password;

  const clearQueuedScroll = useCallback(() => {
    if (queuedScrollTimeoutRef.current) {
      clearTimeout(queuedScrollTimeoutRef.current);
      queuedScrollTimeoutRef.current = null;
    }
  }, []);

  const scrollForFocusedField = useCallback((animated = true) => {
    const anchor = tab === 'signup' ? ctaAnchorRef.current : forgotAnchorRef.current ?? ctaAnchorRef.current;
    const keyboardTop = keyboardTopRef.current;
    if (!anchor || !Number.isFinite(keyboardTop)) {
      return false;
    }

    const keyboardGap = 14;
    anchor.measureInWindow((_x, y, _width, height) => {
      const anchorBottom = y + height;
      const delta = anchorBottom - (keyboardTop - keyboardGap);
      if (Math.abs(delta) < 2) {
        return;
      }
      const nextY = Math.max(0, scrollYRef.current + delta);
      scrollViewRef.current?.scrollTo({
        y: nextY,
        animated,
      });
    });
    return true;
  }, [tab]);

  const queueAnchorScroll = useCallback(
    (delayMs = 0, animated = true) => {
      clearQueuedScroll();
      queuedScrollTimeoutRef.current = setTimeout(() => {
        queuedScrollTimeoutRef.current = null;
        requestAnimationFrame(() => {
          scrollForFocusedField(animated);
        });
      }, delayMs);
    },
    [clearQueuedScroll, scrollForFocusedField],
  );

  const handleFieldFocus = useCallback(() => {
    if (keyboardVisibleRef.current) {
      queueAnchorScroll(40);
      return;
    }
    pendingAnchorScrollRef.current = true;
  }, [queueAnchorScroll]);

  useEffect(() => {
    if (keyboardVisibleRef.current) {
      queueAnchorScroll(48);
      return;
    }

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [queueAnchorScroll, tab]);

  useEffect(() => {
    const applyKeyboardFrame = (event: KeyboardEvent, source: 'will' | 'did') => {
      Keyboard.scheduleLayoutAnimation(event);
      const nextHeight = event.endCoordinates.height;
      const fallbackKeyboardTop = Dimensions.get('window').height - nextHeight;
      const nextKeyboardTop = event.endCoordinates.screenY || fallbackKeyboardTop;
      keyboardVisibleRef.current = true;
      keyboardTopRef.current = nextKeyboardTop;
      setKeyboardHeight(nextHeight);

      const shouldPrioritizeFocusScroll = pendingAnchorScrollRef.current;
      pendingAnchorScrollRef.current = false;
      const delayMs = shouldPrioritizeFocusScroll ? 0 : source === 'will' ? 8 : 20;
      queueAnchorScroll(delayMs);
    };

    const willShowSub =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillShow', (event: KeyboardEvent) => {
            applyKeyboardFrame(event, 'will');
          })
        : null;
    const showSub = Keyboard.addListener('keyboardDidShow', (event: KeyboardEvent) => {
      applyKeyboardFrame(event, 'did');
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      keyboardVisibleRef.current = false;
      keyboardTopRef.current = Number.POSITIVE_INFINITY;
      setKeyboardHeight(0);
      pendingAnchorScrollRef.current = false;
      clearQueuedScroll();
    });

    return () => {
      willShowSub?.remove();
      showSub.remove();
      hideSub.remove();
      clearQueuedScroll();
    };
  }, [clearQueuedScroll, queueAnchorScroll]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <GlobalRecruiterBanner />
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + keyboardHeight + 220 }]}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
          <View style={styles.center}>
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL('https://zenithlegal.com/')}
              style={styles.logoLink}
            >
              <Image
                source={require('../../../assets/zenith-legal-logo.png')}
                style={[styles.brandLogo, { height: logoSize, width: logoSize }]}
                resizeMode="contain"
              />
            </Pressable>
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
                  <Text style={[styles.tabText, tab === 'signup' ? styles.tabTextActive : null]}>
                    Sign Up
                  </Text>
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
                  <Text style={[styles.tabText, tab === 'login' ? styles.tabTextActive : null]}>
                    Log In
                  </Text>
                </Pressable>
              </View>

              <View>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Email"
                  placeholderTextColor={uiColors.textPlaceholder}
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={handleFieldFocus}
                />
              </View>

              {!isSignup ? (
                <View>
                  <PasswordInput
                    placeholder="Password"
                    placeholderTextColor={uiColors.textPlaceholder}
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={handleFieldFocus}
                  />
                </View>
              ) : null}

              <View ref={ctaAnchorRef}>
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
              </View>

              {!isSignup ? (
                <View ref={forgotAnchorRef}>
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
                </View>
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
    gap: 10,
    marginTop: 22,
    width: '100%',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: -50,
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
  logoLink: {
    alignItems: 'center',
    justifyContent: 'center',
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
