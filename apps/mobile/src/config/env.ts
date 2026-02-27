export const env = {
  supabaseUrl:
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  supabaseAnonKey:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key',
  streamApiKey: process.env.EXPO_PUBLIC_STREAM_API_KEY ?? 'hcryqds25ctk',
  supportPhone: process.env.EXPO_PUBLIC_RECRUITER_PHONE ?? '(202) 486-3535',
  supportEmail: process.env.EXPO_PUBLIC_RECRUITER_EMAIL ?? 'mason@zenithlegal.com',
  googleOAuthClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? '',
};

export function isSupabaseSecretKey(value: string): boolean {
  return value.startsWith('sb_secret_');
}

export function getSupabaseClientConfigError(): string | null {
  if (isSupabaseSecretKey(env.supabaseAnonKey)) {
    return 'Supabase mobile key is invalid. Use the Publishable/anon key (not sb_secret).';
  }

  if (
    env.supabaseUrl.includes('placeholder.supabase.co') ||
    env.supabaseAnonKey.includes('public-anon-key')
  ) {
    return 'Supabase config is still using placeholder values.';
  }

  return null;
}

export function assertRequiredEnv(): void {
  const required = [
    ['EXPO_PUBLIC_SUPABASE_URL', env.supabaseUrl],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', env.supabaseAnonKey],
    ['EXPO_PUBLIC_STREAM_API_KEY', env.streamApiKey],
  ];

  const missing = required.filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0 && __DEV__) {
    console.warn(`Missing required env vars: ${missing.join(', ')}`);
  }

  const configError = getSupabaseClientConfigError();
  if (configError && __DEV__) {
    console.warn(configError);
  }
}
