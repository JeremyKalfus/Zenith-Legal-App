import {
  normalizePhoneNumber,
  PHONE_VALIDATION_MESSAGES,
  type CandidateIntake,
} from '@zenith/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import {
  authRedirectUrl,
  completeAuthSessionFromUrl,
  isAuthCallbackUrl,
  supabase,
} from '../lib/supabase';
import { env, getSupabaseClientConfigError } from '../config/env';
import type { CandidateProfile, IntakeDraft } from '../types/domain';
import { registerPushToken } from '../lib/notifications';

type AuthMethods = {
  emailOtpEnabled: boolean;
  smsOtpEnabled: boolean;
  emailOtpStatus: 'unknown' | 'enabled' | 'disabled';
  smsOtpStatus: 'unknown' | 'enabled' | 'disabled';
  lastCheckedAt: number | null;
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
  if (
    message.includes('expired') ||
    message.includes('invalid') ||
    message.includes('grant') ||
    message.includes('otp')
  ) {
    return 'This verification link is invalid or expired. Request a new magic link.';
  }

  return extractErrorMessage(error);
}

function mapSmsAuthErrorToUserMessage(error: unknown): string {
  const message = extractErrorMessage(error).toLowerCase();

  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return 'Cannot reach Supabase right now. Check your internet/VPN and retry.';
  }
  if (
    message.includes('expired') ||
    message.includes('invalid') ||
    message.includes('grant') ||
    message.includes('otp') ||
    message.includes('token')
  ) {
    return 'That SMS code is invalid or expired. Request a new code and try again.';
  }

  return mapAuthErrorToUserMessage(error);
}

function normalizePhoneForAuthOrThrow(input: string): string {
  const normalized = normalizePhoneNumber(input);
  if (!normalized.ok) {
    throw new Error(PHONE_VALIDATION_MESSAGES.invalidMobileForAuth);
  }

  return normalized.e164;
}

type AuthContextValue = {
  session: Session | null;
  profile: CandidateProfile | null;
  intakeDraft: IntakeDraft | null;
  authMethods: AuthMethods;
  authMethodsError: string | null;
  isRefreshingAuthMethods: boolean;
  authConfigError: string | null;
  authNotice: string | null;
  isLoading: boolean;
  setIntakeDraft: (draft: CandidateIntake) => void;
  sendEmailMagicLink: (email: string, options?: OtpOptions) => Promise<void>;
  sendSmsOtp: (phone: string, options?: OtpOptions) => Promise<void>;
  verifySmsOtp: (phone: string, token: string) => Promise<void>;
  persistDraftAfterVerification: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshAuthMethods: () => Promise<void>;
  clearAuthNotice: () => void;
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
    emailOtpStatus: 'unknown',
    smsOtpStatus: 'unknown',
    lastCheckedAt: null,
  });
  const [authMethodsError, setAuthMethodsError] = useState<string | null>(null);
  const [isRefreshingAuthMethods, setIsRefreshingAuthMethods] = useState(false);
  const [authConfigError, setAuthConfigError] = useState<string | null>(
    getSupabaseClientConfigError(),
  );
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastHandledUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  const refreshAuthMethods = useCallback(async (): Promise<void> => {
    if (getSupabaseClientConfigError()) {
      return;
    }

    setIsRefreshingAuthMethods(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const settingsResponse = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
          headers: {
            apikey: env.supabaseAnonKey,
            Authorization: `Bearer ${env.supabaseAnonKey}`,
          },
          signal: controller.signal,
        });

        if (!settingsResponse.ok) {
          let responseDetail = '';
          try {
            responseDetail = await settingsResponse.text();
          } catch {
            responseDetail = '';
          }
          throw new Error(
            `Auth settings check failed (${settingsResponse.status})${responseDetail ? `: ${responseDetail}` : ''}`,
          );
        }

        const settingsJson = (await settingsResponse.json()) as {
          external?: { email?: boolean; phone?: boolean };
        };
        if (!isMountedRef.current) {
          return;
        }

        setAuthMethods({
          emailOtpEnabled: settingsJson.external?.email !== false,
          smsOtpEnabled: settingsJson.external?.phone === true,
          emailOtpStatus: settingsJson.external?.email === false ? 'disabled' : 'enabled',
          smsOtpStatus: settingsJson.external?.phone === true ? 'enabled' : 'disabled',
          lastCheckedAt: Date.now(),
        });
        setAuthMethodsError(null);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      setAuthMethodsError(
        `Could not check SMS availability. You can retry or try sending an SMS code directly. (${extractErrorMessage(error)})`,
      );
      setAuthMethods((previous) => ({
        ...previous,
        emailOtpStatus: previous.emailOtpStatus === 'enabled' ? 'enabled' : 'unknown',
        smsOtpStatus: previous.smsOtpStatus === 'enabled' ? 'enabled' : 'unknown',
      }));
    } finally {
      if (isMountedRef.current) {
        setIsRefreshingAuthMethods(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    isMountedRef.current = true;

    async function bootstrap(): Promise<void> {
      const configError = getSupabaseClientConfigError();
      if (mounted) {
        setAuthConfigError(configError);
      }

      try {
        // Never block loading UI on settings fetch.
        void refreshAuthMethods();

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

    void bootstrap();

    async function processAuthCallbackUrl(url: string | null): Promise<void> {
      if (!url || !isAuthCallbackUrl(url) || lastHandledUrlRef.current === url) {
        return;
      }

      lastHandledUrlRef.current = url;

      try {
        const handled = await completeAuthSessionFromUrl(url);
        if (handled && mounted) {
          setAuthNotice(null);
        }
      } catch (error) {
        if (mounted) {
          setAuthNotice(mapAuthErrorToUserMessage(error));
        }
      }
    }

    Linking.getInitialURL()
      .then((initialUrl) => processAuthCallbackUrl(initialUrl))
      .catch(() => {
        // Non-blocking. We'll still handle live URL events.
      });

    const linkSubscription = Linking.addEventListener('url', (event) => {
      void processAuthCallbackUrl(event.url);
    });

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
      isMountedRef.current = false;
      linkSubscription.remove();
      subscription.unsubscribe();
    };
  }, [refreshAuthMethods]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      intakeDraft,
      authMethods,
      authMethodsError,
      isRefreshingAuthMethods,
      authConfigError,
      authNotice,
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
        const normalizedPhone = normalizePhoneForAuthOrThrow(phone);

        const { error } = await supabase.auth.signInWithOtp({
          phone: normalizedPhone,
          options: {
            shouldCreateUser: options?.shouldCreateUser ?? true,
          },
        });
        if (error) {
          throw new Error(mapSmsAuthErrorToUserMessage(error));
        }
      },
      verifySmsOtp: async (phone: string, token: string) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }
        const normalizedPhone = normalizePhoneForAuthOrThrow(phone);

        const { error } = await supabase.auth.verifyOtp({
          phone: normalizedPhone,
          token,
          type: 'sms',
        });
        if (error) {
          throw new Error(mapSmsAuthErrorToUserMessage(error));
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
      refreshAuthMethods,
      clearAuthNotice: () => setAuthNotice(null),
    }),
    [
      authConfigError,
      authMethods,
      authMethodsError,
      authNotice,
      intakeDraft,
      isLoading,
      isRefreshingAuthMethods,
      profile,
      refreshAuthMethods,
      session,
    ],
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
