import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DashboardScreen } from '../screens/candidate/dashboard-screen';
import { MessagesScreen } from '../screens/candidate/messages-screen';
import { AppointmentsScreen } from '../screens/candidate/appointments-screen';
import { ProfileScreen } from '../screens/candidate/profile-screen';
import { uiColors } from '../theme/colors';
import { useCandidateTabIndicators } from '../lib/use-candidate-tab-indicators';

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
  const { hasAppointmentAttention, unreadMessagesCount } = useCandidateTabIndicators();
  const unreadBadgeLabel =
    unreadMessagesCount > 0 ? (unreadMessagesCount > 9 ? '9+' : String(unreadMessagesCount)) : null;

  return (
    <Tab.Navigator
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'none',
        lazy: false,
        tabBarActiveTintColor: uiColors.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size, focused }) => {
          const showAppointmentsDot = route.name === 'Appointments' && hasAppointmentAttention;
          const showMessageBadge = route.name === 'Messages' && Boolean(unreadBadgeLabel);
          return (
            <View style={styles.iconContainer}>
              <Ionicons
                name={getCandidateTabIconName(route.name, focused)}
                color={color}
                size={size}
              />
              {showMessageBadge ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{unreadBadgeLabel}</Text>
                </View>
              ) : null}
              {showAppointmentsDot ? <View style={styles.dotBadge} /> : null}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard">
        {({ navigation }) => (
          <DashboardScreen
            onOpenMessages={() => {
              navigation.navigate('Messages' as never);
            }}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 32,
  },
  dotBadge: {
    backgroundColor: uiColors.errorBright,
    borderColor: uiColors.surface,
    borderRadius: 999,
    borderWidth: 1.5,
    height: 10,
    position: 'absolute',
    right: -3,
    top: -2,
    width: 10,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: uiColors.errorBright,
    borderRadius: 999,
    borderColor: uiColors.surface,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: 'absolute',
    right: -8,
    top: -5,
  },
  countBadgeText: {
    color: uiColors.primaryText,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
