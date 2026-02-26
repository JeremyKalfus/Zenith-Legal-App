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
      <Stack.Screen name="StaffMessagesInbox" options={{ title: 'Messages' }}>
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
        })}
      >
        {({ route }) => (
          <StaffMessageThreadScreen candidateUserId={route.params.conversation.candidateUserId} />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
