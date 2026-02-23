import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StaffCandidatesScreen } from '../screens/staff/staff-candidates-screen';
import { StaffCandidateFirmsScreen } from '../screens/staff/staff-candidate-firms-screen';
import type { StaffCandidateListItem } from '../features/staff-candidate-management';

type StaffCandidatesStackParamList = {
  StaffCandidatesList: undefined;
  StaffCandidateFirms: {
    candidate: StaffCandidateListItem;
  };
};

const Stack = createNativeStackNavigator<StaffCandidatesStackParamList>();

export function StaffCandidatesStackNavigator() {
  return (
    <Stack.Navigator>
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
