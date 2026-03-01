import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StaffAppointmentsScreen } from '../screens/staff/staff-appointments-screen';
import { StaffProfileScreen } from '../screens/staff/staff-profile-screen';
import { StaffCandidatesStackNavigator } from './staff-candidates-stack';
import { StaffMessagesStackNavigator } from './staff-messages-stack';
import { uiColors } from '../theme/colors';
import { useStaffTabIndicators } from '../lib/use-staff-tab-indicators';

const Tab = createBottomTabNavigator();
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type MaybeNestedRouteState = {
  key: string;
  name?: string;
  state?: {
    key?: string;
  };
};
type TabNavigationProxy = {
  getState: () => { index: number; routes: unknown[] };
  dispatch: (action: unknown) => void;
};
const STACK_TAB_ROOT_ROUTE_BY_TAB = {
  Messages: 'StaffMessagesInbox',
  Candidates: 'StaffCandidatesList',
} as const;

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

function resetNestedStackToRoot(navigation: { dispatch: (action: unknown) => void }, route: unknown): void {
  const tabName = (route as MaybeNestedRouteState).name;
  const rootRouteName = tabName
    ? STACK_TAB_ROOT_ROUTE_BY_TAB[tabName as keyof typeof STACK_TAB_ROOT_ROUTE_BY_TAB]
    : undefined;
  const nestedNavigatorKey = (route as MaybeNestedRouteState).state?.key;
  if (!nestedNavigatorKey || !rootRouteName) {
    return;
  }

  navigation.dispatch({
    ...CommonActions.reset({
      index: 0,
      routes: [{ name: rootRouteName }],
    }),
    target: nestedNavigatorKey,
  });
}

function resetCurrentStackTabToRootOnTabPress(
  navigation: TabNavigationProxy,
  targetTabRouteKey: string,
): void {
  const state = navigation.getState();
  const currentRoute = state.routes[state.index] as MaybeNestedRouteState | undefined;

  if (!currentRoute || currentRoute.key === targetTabRouteKey) {
    return;
  }

  resetNestedStackToRoot(navigation, currentRoute);
}

export function StaffTabs() {
  const { hasAppointmentAttention, unreadMessagesCount } = useStaffTabIndicators();
  const unreadBadgeLabel =
    unreadMessagesCount > 0 ? (unreadMessagesCount > 9 ? '9+' : String(unreadMessagesCount)) : null;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: uiColors.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size, focused }) => {
          const showMessageBadge = route.name === 'Messages' && Boolean(unreadBadgeLabel);
          const showAppointmentsDot = route.name === 'Appointments' && hasAppointmentAttention;
          return (
            <View style={styles.iconContainer}>
              <Ionicons name={getStaffTabIconName(route.name, focused)} color={color} size={size} />
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
      <Tab.Screen
        name="Messages"
        component={StaffMessagesStackNavigator}
        listeners={({ navigation, route }) => ({
          tabPress: () => {
            resetCurrentStackTabToRootOnTabPress(navigation as TabNavigationProxy, route.key);
          },
          blur: () => {
            resetNestedStackToRoot(navigation as { dispatch: (action: unknown) => void }, route);
          },
        })}
      />
      <Tab.Screen
        name="Appointments"
        component={StaffAppointmentsScreen}
        listeners={({ navigation, route }) => ({
          tabPress: () => {
            resetCurrentStackTabToRootOnTabPress(navigation as TabNavigationProxy, route.key);
          },
        })}
      />
      <Tab.Screen
        name="Candidates"
        component={StaffCandidatesStackNavigator}
        listeners={({ navigation, route }) => ({
          tabPress: () => {
            resetCurrentStackTabToRootOnTabPress(navigation as TabNavigationProxy, route.key);
          },
          blur: () => {
            resetNestedStackToRoot(navigation as { dispatch: (action: unknown) => void }, route);
          },
        })}
      />
      <Tab.Screen
        name="Profile"
        component={StaffProfileScreen}
        listeners={({ navigation, route }) => ({
          tabPress: () => {
            resetCurrentStackTabToRootOnTabPress(navigation as TabNavigationProxy, route.key);
          },
        })}
      />
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
  countBadge: {
    alignItems: 'center',
    backgroundColor: uiColors.errorBright,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: uiColors.surface,
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
});
