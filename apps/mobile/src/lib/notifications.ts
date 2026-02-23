import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  if (!Device.isDevice) {
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      device_platform: Platform.OS,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'user_id,expo_push_token' },
  );
}
