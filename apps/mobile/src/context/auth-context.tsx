import type { CandidateIntake } from '@zenith/shared';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authRedirectUrl, supabase } from '../lib/supabase';
import { env, getSupabaseClientConfigError } from '../config/env';
import type { CandidateProfile, IntakeDraft } from '../types/domain';
import { registerPushToken } from '../lib/notifications';

type AuthMethods = {
  emailOtpEnabled: boolean;
  smsOtpEnabled: boolean;
};

type OtpOptions = {
  shouldCreateUser?: boolean;
};

function extractErrorMessage(error: unknown): string {
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
  return 'Unknown error';
}

function mapAuthErrorToUserMessage(error: unknown): string {
  const message = extractErrorMessage(error).toLowerCase();

  if (message.includes('email rate limit exceeded')) {
    return 'Too many email code requests. Wait 60 seconds and try again.';
  }
  if (message.includes('unsupported phone provider') || message.includes('phone provider')) {
    return 'SMS sign-in is not configured in Supabase yet. Use email magic link.';
  }
  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return 'Cannot reach Supabase right now. Check your internet/VPN and retry.';
  }

  return extractErrorMessage(error);
}

type AuthContextValue = {
  session: Session | null;
  profile: CandidateProfile | null;
  intakeDraft: IntakeDraft | null;
  authMethods: AuthMethods;
  authConfigError: string | null;
  isLoading: boolean;
  setIntakeDraft: (draft: CandidateIntake) => void;
  sendEmailMagicLink: (email: string, options?: OtpOptions) => Promise<void>;
  sendSmsOtp: (phone: string, options?: OtpOptions) => Promise<void>;
  verifySmsOtp: (phone: string, token: string) => Promise<void>;
  persistDraftAfterVerification: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<CandidateProfile | null> {
  const { data, error } = await supabase
    .from('users_profile')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CandidateProfile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [intakeDraft, setIntakeDraftState] = useState<IntakeDraft | null>(null);
  const [authMethods, setAuthMethods] = useState<AuthMethods>({
    emailOtpEnabled: true,
    smsOtpEnabled: false,
  });
  const [authConfigError, setAuthConfigError] = useState<string | null>(
    getSupabaseClientConfigError(),
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadAuthMethods(): Promise<void> {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const settingsResponse = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
          headers: {
            apikey: env.supabaseAnonKey,
            Authorization: `Bearer ${env.supabaseAnonKey}`,
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (settingsResponse.ok) {
          const settingsJson = (await settingsResponse.json()) as {
            external?: { email?: boolean; phone?: boolean };
          };
          if (mounted) {
            setAuthMethods({
              emailOtpEnabled: settingsJson.external?.email !== false,
              smsOtpEnabled: settingsJson.external?.phone === true,
            });
          }
        }
      } catch {
        // Keep optimistic defaults if auth settings are temporarily unavailable.
      }
    }

    async function bootstrap(): Promise<void> {
      const configError = getSupabaseClientConfigError();
      if (mounted) {
        setAuthConfigError(configError);
      }

      try {
        // Never block loading UI on settings fetch.
        void loadAuthMethods();

        const { data } = await supabase.auth.getSession();
        if (!mounted) {
          return;
        }

        setSession(data.session ?? null);
        if (data.session?.user.id) {
          const nextProfile = await fetchProfile(data.session.user.id);
          setProfile(nextProfile);
          void registerPushToken(data.session.user.id).catch(() => {
            // Non-blocking by design.
          });
        }
      } catch {
        // Fail open into auth screens instead of hanging on spinner.
        if (mounted) {
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user.id) {
        const nextProfile = await fetchProfile(nextSession.user.id);
        setProfile(nextProfile);
        void registerPushToken(nextSession.user.id).catch(() => {
          // Non-blocking by design.
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      intakeDraft,
      authMethods,
      authConfigError,
      isLoading,
      setIntakeDraft: (draft) => setIntakeDraftState(draft),
      sendEmailMagicLink: async (email: string, options?: OtpOptions) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }

        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: authRedirectUrl,
            shouldCreateUser: options?.shouldCreateUser ?? true,
          },
        });
        if (error) {
          throw new Error(mapAuthErrorToUserMessage(error));
        }
      },
      sendSmsOtp: async (phone: string, options?: OtpOptions) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }

        const { error } = await supabase.auth.signInWithOtp({
          phone,
          options: {
            shouldCreateUser: options?.shouldCreateUser ?? true,
          },
        });
        if (error) {
          throw new Error(mapAuthErrorToUserMessage(error));
        }
      },
      verifySmsOtp: async (phone: string, token: string) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }

        const { error } = await supabase.auth.verifyOtp({
          phone,
          token,
          type: 'sms',
        });
        if (error) {
          throw new Error(mapAuthErrorToUserMessage(error));
        }
      },
      persistDraftAfterVerification: async () => {
        if (!intakeDraft) {
          return;
        }

        const { error } = await supabase.functions.invoke(
          'create_or_update_candidate_profile',
          {
            body: intakeDraft,
          },
        );

        if (error) {
          throw error;
        }

        if (session?.user.id) {
          const nextProfile = await fetchProfile(session.user.id);
          setProfile(nextProfile);
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshProfile: async () => {
        if (!session?.user.id) {
          return;
        }

        const nextProfile = await fetchProfile(session.user.id);
        setProfile(nextProfile);
      },
    }),
    [authConfigError, authMethods, intakeDraft, isLoading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
