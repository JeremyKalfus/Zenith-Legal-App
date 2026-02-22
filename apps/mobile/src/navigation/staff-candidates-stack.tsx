import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text } from 'react-native';
import { StaffCandidatesScreen } from '../screens/staff/staff-candidates-screen';
import { StaffCandidateFirmsScreen } from '../screens/staff/staff-candidate-firms-screen';
import type { StaffCandidateListItem } from '../features/staff-candidate-management';
import { useAuth } from '../context/auth-context';

type StaffCandidatesStackParamList = {
  StaffCandidatesList: undefined;
  StaffCandidateFirms: {
    candidate: StaffCandidateListItem;
  };
};

const Stack = createNativeStackNavigator<StaffCandidatesStackParamList>();

export function StaffCandidatesStackNavigator() {
  const { isSigningOut, signOut } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
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
      <Stack.Screen name="StaffCandidatesList" options={{ title: 'Candidates' }}>
        {({ navigation }) => (
          <StaffCandidatesScreen
            onOpenCandidate={(candidate) => {
              navigation.navigate('StaffCandidateFirms', { candidate });
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="StaffCandidateFirms"
        options={({ route }) => ({
          title: route.params.candidate.name || 'Candidate',
        })}
      >
        {({ route }) => <StaffCandidateFirmsScreen candidate={route.params.candidate} />}
      </Stack.Screen>
    </Stack.Navigator>
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
