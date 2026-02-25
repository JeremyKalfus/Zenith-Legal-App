import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StaffAppointmentsScreen } from '../screens/staff/staff-appointments-screen';
import { StaffProfileScreen } from '../screens/staff/staff-profile-screen';
import { StaffCandidatesStackNavigator } from './staff-candidates-stack';
import { StaffMessagesStackNavigator } from './staff-messages-stack';
import { uiColors } from '../theme/colors';

const Tab = createBottomTabNavigator();
type IoniconName = ComponentProps<typeof Ionicons>['name'];

function getStaffTabIconName(routeName: string, focused: boolean): IoniconName {
  switch (routeName) {
    case 'Messages':
      return focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
    case 'Appointments':
      return focused ? 'calendar' : 'calendar-outline';
    case 'Candidates':
      return focused ? 'people' : 'people-outline';
    case 'Profile':
      return focused ? 'person' : 'person-outline';
    default:
      return focused ? 'ellipse' : 'ellipse-outline';
  }
}

export function StaffTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarActiveTintColor: uiColors.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={getStaffTabIconName(route.name, focused)} color={color} size={size} />
        ),
      })}
    >
      <Tab.Screen
        name="Messages"
        component={StaffMessagesStackNavigator}
        options={{ headerShown: false }}
      />
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
