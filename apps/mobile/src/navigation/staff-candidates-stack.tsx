import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StaffCandidatesScreen } from '../screens/staff/staff-candidates-screen';
import { StaffCandidateFirmsScreen } from '../screens/staff/staff-candidate-firms-screen';
import type { StaffCandidateListItem } from '../features/staff-candidate-management';
import {
  StaffCandidateFiltersScreen,
  type StaffCandidateFilters,
  type StaffCandidateFilterOptions,
} from '../screens/staff/staff-candidate-filters-screen';

export type StaffCandidatesStackParamList = {
  StaffCandidatesList: {
    appliedFilters?: StaffCandidateFilters;
  } | undefined;
  StaffCandidateFirms: {
    candidate: StaffCandidateListItem;
  };
  StaffCandidateFilters: {
    initialFilters: StaffCandidateFilters;
    options: StaffCandidateFilterOptions;
  };
};

const Stack = createNativeStackNavigator<StaffCandidatesStackParamList>();

export function StaffCandidatesStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="StaffCandidatesList" options={{ headerShown: false }}>
        {({ navigation, route }) => (
          <StaffCandidatesScreen
            incomingAppliedFilters={route.params?.appliedFilters}
            onOpenCandidate={(candidate) => {
              navigation.navigate('StaffCandidateFirms', { candidate });
            }}
            onOpenFilterSearch={(params) => {
              navigation.navigate('StaffCandidateFilters', params);
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="StaffCandidateFirms"
        options={({ route }) => ({
          title: route.params.candidate.name || 'Candidate',
          headerBackTitleVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        })}
      >
        {({ route }) => <StaffCandidateFirmsScreen candidate={route.params.candidate} />}
      </Stack.Screen>
      <Stack.Screen
        name="StaffCandidateFilters"
        options={{
          title: 'Filter Search',
          headerBackTitleVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
        component={StaffCandidateFiltersScreen}
      />
    </Stack.Navigator>
  );
}
