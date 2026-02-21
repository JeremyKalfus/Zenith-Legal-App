import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { env } from '../config/env';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const projectRef = env.supabaseUrl.split('//')[1]?.split('.')[0] ?? '';
const redirectTo = projectRef ? Linking.createURL('/auth/callback') : undefined;

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-Client-Info': 'zenith-legal-mobile',
    },
  },
});

export const authRedirectUrl = redirectTo;
