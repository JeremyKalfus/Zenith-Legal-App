import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { DashboardScreen } from '../screens/candidate/dashboard-screen';
import { MessagesScreen } from '../screens/candidate/messages-screen';
import { AppointmentsScreen } from '../screens/candidate/appointments-screen';
import { ProfileScreen } from '../screens/candidate/profile-screen';
import { CandidateCornerLogo } from '../components/candidate-corner-logo';
import { uiColors } from '../theme/colors';

const Tab = createBottomTabNavigator();
type IoniconName = ComponentProps<typeof Ionicons>['name'];

function getCandidateTabIconName(routeName: string, focused: boolean): IoniconName {
  switch (routeName) {
    case 'Dashboard':
      return focused ? 'home' : 'home-outline';
    case 'Messages':
      return focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
    case 'Appointments':
      return focused ? 'calendar' : 'calendar-outline';
    case 'Profile':
      return focused ? 'person' : 'person-outline';
    default:
      return focused ? 'ellipse' : 'ellipse-outline';
  }
}

export function CandidateTabs() {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: uiColors.primary,
          tabBarInactiveTintColor: '#64748B',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={getCandidateTabIconName(route.name, focused)}
              color={color}
              size={size}
            />
          ),
        })}
      >
        <Tab.Screen name="Dashboard">
          {({ navigation }) => (
            <DashboardScreen
              onOpenMessages={() => navigation.navigate('Messages' as never)}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Messages" component={MessagesScreen} />
        <Tab.Screen name="Appointments" component={AppointmentsScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
      <CandidateCornerLogo />
    </View>
  );
}
