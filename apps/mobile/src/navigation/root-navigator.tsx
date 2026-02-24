import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { CandidateTabs } from './candidate-tabs';
import { StaffTabs } from './staff-tabs';
import { IntakeScreen } from '../screens/auth/intake-screen';
import { SignInScreen } from '../screens/auth/sign-in-screen';
import { useAuth } from '../context/auth-context';
import { uiColors } from '../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../theme/pressable';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const {
    isHydratingProfile,
    isLoading,
    isSigningOut,
    needsPasswordReset,
    profile,
    profileLoadError,
    refreshProfile,
    session,
    signOut,
  } = useAuth();
  const [authStep, setAuthStep] = useState<'intake' | 'signin'>('intake');

  useEffect(() => {
    if (needsPasswordReset) {
      setAuthStep('signin');
    }
  }, [needsPasswordReset]);

  const isAuthenticated = useMemo(
    () => !!session?.user && !needsPasswordReset,
    [needsPasswordReset, session?.user],
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const needsProfileHydrationGate = isAuthenticated && !profile && isHydratingProfile;
  const showProfileRecovery = isAuthenticated && !profile && !isHydratingProfile;

  return (
    <NavigationContainer>
      {!isAuthenticated ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {authStep === 'intake' ? (
            <Stack.Screen name="Intake">
              {() => (
                <IntakeScreen
                  onSignIn={() => setAuthStep('signin')}
                />
              )}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="SignIn">
              {() => <SignInScreen onBack={() => setAuthStep('intake')} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      ) : needsProfileHydrationGate ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading account...</Text>
        </View>
      ) : showProfileRecovery ? (
        <View style={styles.recoveryContainer}>
          <Text style={styles.recoveryTitle}>Account profile unavailable</Text>
          <Text style={styles.recoveryBody}>
            {profileLoadError ??
              'Your session is active, but account profile data is still unavailable.'}
          </Text>
          <Pressable
            style={interactivePressableStyle({
              base: styles.primaryButton,
              disabled: isSigningOut,
              hoverStyle: sharedPressableFeedback.hover,
              focusStyle: sharedPressableFeedback.focus,
              pressedStyle: sharedPressableFeedback.pressed,
            })}
            disabled={isSigningOut}
            onPress={() => {
              void refreshProfile();
            }}
          >
            <Text style={styles.primaryButtonText}>Retry profile</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, isSigningOut && styles.secondaryButtonDisabled]}
            disabled={isSigningOut}
            onPress={() => {
              void signOut();
            }}
          >
            <Text style={styles.secondaryButtonText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</Text>
          </Pressable>
        </View>
      ) : profile?.role === 'staff' ? (
        <StaffTabs />
      ) : (
        <CandidateTabs />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#475569',
    marginTop: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  primaryButtonText: {
    color: uiColors.primaryText,
    fontWeight: '700',
  },
  recoveryBody: {
    color: '#475569',
    marginBottom: 12,
    textAlign: 'center',
  },
  recoveryContainer: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 24,
  },
  recoveryTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '600',
  },
});
