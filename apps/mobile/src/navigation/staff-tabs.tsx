import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StaffAppointmentsScreen } from '../screens/staff/staff-appointments-screen';
import { StaffMessagesScreen } from '../screens/staff/staff-messages-screen';
import { StaffProfileScreen } from '../screens/staff/staff-profile-screen';
import { StaffCandidatesStackNavigator } from './staff-candidates-stack';

const Tab = createBottomTabNavigator();

export function StaffTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen name="Messages" component={StaffMessagesScreen} />
      <Tab.Screen name="Appointments" component={StaffAppointmentsScreen} />
      <Tab.Screen
        name="Candidates"
        component={StaffCandidatesStackNavigator}
        options={{ headerShown: false }}
      />
      <Tab.Screen name="Profile" component={StaffProfileScreen} />
    </Tab.Navigator>
  );
}
