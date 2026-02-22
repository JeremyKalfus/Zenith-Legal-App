import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { CandidateTabs } from './candidate-tabs';
import { StaffTabs } from './staff-tabs';
import { IntakeScreen } from '../screens/auth/intake-screen';
import { VerifyScreen } from '../screens/auth/verify-screen';
import { SignInScreen } from '../screens/auth/sign-in-screen';
import { useAuth } from '../context/auth-context';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { isLoading, profile, session, persistDraftAfterVerification } = useAuth();
  const [authStep, setAuthStep] = useState<'intake' | 'verify' | 'signin'>('intake');

  useEffect(() => {
    if (session?.user.id && !profile?.onboarding_complete) {
      persistDraftAfterVerification().catch(() => {
        // ignored on purpose; user can retry from profile refresh
      });
    }
  }, [persistDraftAfterVerification, profile?.onboarding_complete, session?.user.id]);

  const isAuthenticated = useMemo(() => !!session?.user, [session?.user]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!isAuthenticated ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {authStep === 'intake' ? (
            <Stack.Screen name="Intake">
              {() => (
                <IntakeScreen
                  onContinue={() => setAuthStep('verify')}
                  onSignIn={() => setAuthStep('signin')}
                />
              )}
            </Stack.Screen>
          ) : authStep === 'signin' ? (
            <Stack.Screen name="SignIn">
              {() => <SignInScreen onBack={() => setAuthStep('intake')} />}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="Verify" component={VerifyScreen} />
          )}
        </Stack.Navigator>
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
});
