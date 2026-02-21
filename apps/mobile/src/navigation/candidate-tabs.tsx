import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '../screens/candidate/dashboard-screen';
import { MessagesScreen } from '../screens/candidate/messages-screen';
import { AppointmentsScreen } from '../screens/candidate/appointments-screen';
import { ProfileScreen } from '../screens/candidate/profile-screen';

const Tab = createBottomTabNavigator();

export function CandidateTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
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
  );
}
