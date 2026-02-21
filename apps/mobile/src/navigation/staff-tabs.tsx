import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StaffAppointmentsScreen } from '../screens/staff/staff-appointments-screen';
import { StaffMessagesScreen } from '../screens/staff/staff-messages-screen';

const Tab = createBottomTabNavigator();

export function StaffTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Messages" component={StaffMessagesScreen} />
      <Tab.Screen name="Appointments" component={StaffAppointmentsScreen} />
    </Tab.Navigator>
  );
}
