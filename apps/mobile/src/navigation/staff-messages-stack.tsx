import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { StaffMessageInboxItem } from '@zenith/shared';
import { StaffMessageThreadScreen } from '../screens/staff/staff-message-thread-screen';
import { StaffMessagesScreen } from '../screens/staff/staff-messages-screen';

type StaffMessagesStackParamList = {
  StaffMessagesInbox: undefined;
  StaffMessageThread: {
    conversation: StaffMessageInboxItem;
  };
};

const Stack = createNativeStackNavigator<StaffMessagesStackParamList>();

export function StaffMessagesStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="StaffMessagesInbox" options={{ headerShown: false }}>
        {({ navigation }) => (
          <StaffMessagesScreen
            onOpenConversation={(conversation) => {
              navigation.navigate('StaffMessageThread', { conversation });
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="StaffMessageThread"
        options={({ route }) => ({
          title: route.params.conversation.channelName,
          headerBackTitleVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
          gestureResponseDistance: { start: 18 },
          animation: 'slide_from_right',
          animationMatchesGesture: true,
        })}
      >
        {({ route }) => (
          <StaffMessageThreadScreen channelId={route.params.conversation.channelId} />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
