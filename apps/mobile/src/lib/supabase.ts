import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { env } from '../config/env';

function createStorageAdapter() {
  if (Platform.OS === 'web') {
    return {
      getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key: string, value: string) => {
        localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        localStorage.removeItem(key);
        return Promise.resolve();
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  return {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  };
}

const storageAdapter = createStorageAdapter();

const projectRef = env.supabaseUrl.split('//')[1]?.split('.')[0] ?? '';
const redirectTo = projectRef ? Linking.createURL('/auth/callback') : undefined;

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
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

export async function ensureValidSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('You are not signed in. Please sign in and try again.');
  }

  const expiresAt = session.expires_at ?? 0;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (nowSeconds >= expiresAt - 60) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    return data.session;
  }

  return session;
}

function getUrlParamMaps(url: string): {
  queryParams: URLSearchParams;
  fragmentParams: URLSearchParams;
} {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const parsed = new URL(withoutHash);

  return {
    queryParams: parsed.searchParams,
    fragmentParams: new URLSearchParams(hash),
  };
}

function getParam(
  name: string,
  queryParams: URLSearchParams,
  fragmentParams: URLSearchParams,
): string | null {
  return queryParams.get(name) ?? fragmentParams.get(name);
}

export function isAuthCallbackUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  return (
    url.includes('auth/callback') ||
    url.includes('code=') ||
    url.includes('access_token=') ||
    url.includes('token_hash=')
  );
}

export async function completeAuthSessionFromUrl(
  url: string,
): Promise<'pkce' | 'session' | 'token_hash' | null> {
  if (!isAuthCallbackUrl(url)) {
    return null;
  }

  const { queryParams, fragmentParams } = getUrlParamMaps(url);
  const code = getParam('code', queryParams, fragmentParams);
  const accessToken = getParam('access_token', queryParams, fragmentParams);
  const refreshToken = getParam('refresh_token', queryParams, fragmentParams);
  const tokenHash = getParam('token_hash', queryParams, fragmentParams);
  const otpType = getParam('type', queryParams, fragmentParams);
  const callbackErrorDescription = getParam('error_description', queryParams, fragmentParams);
  const callbackError = getParam('error', queryParams, fragmentParams);

  if (callbackError || callbackErrorDescription) {
    throw new Error(callbackErrorDescription ?? callbackError ?? 'Auth callback failed');
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }
    return 'pkce';
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw error;
    }
    return 'session';
  }

  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email',
    });
    if (error) {
      throw error;
    }
    return 'token_hash';
  }

  return null;
}
