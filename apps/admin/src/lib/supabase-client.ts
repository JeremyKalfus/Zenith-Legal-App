import { createClient } from '@supabase/supabase-js';

const MILLISECONDS_PER_SECOND = 1000;
const SESSION_REFRESH_BUFFER_SECONDS = 60;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key';

export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'zenith-legal-admin',
    },
  },
});

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return '';
}

function isInvalidRefreshTokenError(error: unknown): boolean {
  const message = getAuthErrorMessage(error).toLowerCase();
  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('refresh_token_not_found')
  );
}

async function clearPersistedAuthSession(): Promise<void> {
  await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

export async function ensureValidSession() {
  const {
    data: { session },
    error: getSessionError,
  } = await supabaseClient.auth.getSession();

  if (getSessionError) {
    if (isInvalidRefreshTokenError(getSessionError)) {
      await clearPersistedAuthSession();
      throw new Error('Your session has expired. Please sign in again.');
    }
    throw getSessionError;
  }

  if (!session) {
    throw new Error('You are not signed in. Please sign in again.');
  }

  const expiresAt = session.expires_at ?? 0;
  const nowSeconds = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);

  if (nowSeconds >= expiresAt - SESSION_REFRESH_BUFFER_SECONDS) {
    const { data, error } = await supabaseClient.auth.refreshSession();
    if (error || !data.session) {
      if (error && isInvalidRefreshTokenError(error)) {
        await clearPersistedAuthSession();
      }
      throw new Error('Your session has expired. Please sign in again.');
    }
    return data.session;
  }

  return session;
}
