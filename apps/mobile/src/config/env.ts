export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  streamApiKey: process.env.EXPO_PUBLIC_STREAM_API_KEY ?? '',
  supportPhone: process.env.EXPO_PUBLIC_RECRUITER_PHONE ?? '+12025550123',
  supportEmail: process.env.EXPO_PUBLIC_RECRUITER_EMAIL ?? 'recruiting@zenithlegal.com',
};

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
}
