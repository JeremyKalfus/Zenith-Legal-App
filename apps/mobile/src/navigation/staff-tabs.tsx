import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useAuth } from '../context/auth-context';
import { StaffAppointmentsScreen } from '../screens/staff/staff-appointments-screen';
import { StaffMessagesScreen } from '../screens/staff/staff-messages-screen';
import { StaffCandidatesStackNavigator } from './staff-candidates-stack';

const Tab = createBottomTabNavigator();

export function StaffTabs() {
  const { isSigningOut, signOut } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerRight: () => (
          <Pressable
            onPress={() => {
              if (!isSigningOut) {
                void signOut();
              }
            }}
            disabled={isSigningOut}
            accessibilityState={{ disabled: isSigningOut }}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && !isSigningOut ? styles.signOutButtonPressed : null,
              isSigningOut ? styles.signOutButtonDisabled : null,
            ]}
          >
            <Text style={styles.signOutText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</Text>
          </Pressable>
        ),
      }}
    >
      <Tab.Screen name="Messages" component={StaffMessagesScreen} />
      <Tab.Screen name="Appointments" component={StaffAppointmentsScreen} />
      <Tab.Screen
        name="Candidates"
        component={StaffCandidatesStackNavigator}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  signOutButton: {
    borderRadius: 8,
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  signOutButtonDisabled: {
    opacity: 0.6,
  },
  signOutButtonPressed: {
    backgroundColor: '#E2E8F0',
  },
  signOutText: {
    color: '#7F1D1D',
    fontWeight: '700',
  },
});
