import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { CandidateTabs } from './candidate-tabs';
import { StaffTabs } from './staff-tabs';
import { IntakeScreen } from '../screens/auth/intake-screen';
import { SignInScreen } from '../screens/auth/sign-in-screen';
import { useAuth } from '../context/auth-context';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { isLoading, needsPasswordReset, profile, session } = useAuth();
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
