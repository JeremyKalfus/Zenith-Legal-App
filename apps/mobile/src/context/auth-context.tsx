import {
  normalizePhoneNumber,
  PHONE_VALIDATION_MESSAGES,
  type CandidateRegistration,
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

type PasswordAuthSessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: unknown;
};

type PublicFunctionError = {
  ok?: false;
  code?: string;
  error?: string;
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

async function extractFunctionInvokeErrorMessage(error: unknown, data?: unknown): Promise<string> {
  if (typeof data === 'object' && data && 'error' in data) {
    const payloadMessage = (data as { error?: unknown }).error;
    if (typeof payloadMessage === 'string' && payloadMessage.trim()) {
      return payloadMessage;
    }
  }

  if (typeof error === 'object' && error && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const json = (await context.clone().json()) as { error?: unknown; message?: unknown; code?: unknown };
        if (typeof json.error === 'string' && json.error.trim()) {
          return json.error;
        }
        if (typeof json.message === 'string' && json.message.trim()) {
          return json.message;
        }
        if (typeof json.code === 'string' && json.code.trim()) {
          return json.code;
        }
      } catch {
        try {
          const text = await context.clone().text();
          if (text.trim()) {
            return text;
          }
        } catch {
          // Fall through to generic extractor below.
        }
      }
    }
  }

  return extractErrorMessage(error);
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
    if (message.includes('recovery')) {
      return 'This password reset link is invalid or expired. Request a new reset link.';
    }
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

function mapPasswordAuthErrorToUserMessage(error: unknown): string {
  const message = extractErrorMessage(error).toLowerCase();

  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return 'Cannot reach Supabase right now. Check your internet/VPN and retry.';
  }
  if (message.includes('invalid_identifier')) {
    return PHONE_VALIDATION_MESSAGES.invalidMobileForAuth;
  }
  if (message.includes('account_exists_auth_only')) {
    return 'This email already exists but your profile setup is incomplete. Sign in or reset your password.';
  }
  if (message.includes('invalid email/phone or password') || message.includes('invalid login credentials')) {
    return 'Invalid email or password.';
  }
  if (message.includes('password reset link sent')) {
    return 'Password reset link sent to your email.';
  }
  if (message.includes('reset link is invalid') || message.includes('recovery')) {
    return 'This password reset link is invalid or expired. Request a new reset link.';
  }

  return extractErrorMessage(error);
}

function mapRegistrationErrorToUserMessage(error: unknown): string {
  const message = extractErrorMessage(error).toLowerCase();

  if (message.includes('duplicate_email')) {
    return 'An account with this email already exists. Sign in or reset your password.';
  }
  if (message.includes('account_exists_auth_only')) {
    return 'This email already exists but your profile setup is incomplete. Sign in or reset your password.';
  }
  if (message.includes('duplicate_mobile')) {
    return 'An account with this mobile number already exists. Sign in or reset your password.';
  }

  return mapPasswordAuthErrorToUserMessage(error);
}

function extractCallbackType(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(/[?#&]type=([^&#]+)/i);
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

async function callPublicFunctionJson<TResponse>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetch(`${env.supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      'x-client-info': 'zenith-legal-mobile',
    },
    body: JSON.stringify(payload),
  });

  const json = (await response.json().catch(() => ({}))) as TResponse & PublicFunctionError;
  if (!response.ok) {
    const errorCode = typeof json.code === 'string' ? json.code : 'request_failed';
    const errorMessage = typeof json.error === 'string' ? json.error : `Request failed (${response.status})`;
    throw new Error(`${errorCode}: ${errorMessage}`);
  }

  return json;
}

async function setSupabaseSessionFromPasswordAuth(
  sessionPayload: PasswordAuthSessionPayload | null | undefined,
): Promise<void> {
  if (!sessionPayload?.access_token || !sessionPayload?.refresh_token) {
    throw new Error('Invalid session returned from auth service');
  }

  const { error } = await supabase.auth.setSession({
    access_token: sessionPayload.access_token,
    refresh_token: sessionPayload.refresh_token,
  });

  if (error) {
    throw error;
  }
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
  isHydratingProfile: boolean;
  profileLoadError: string | null;
  needsPasswordReset: boolean;
  intakeDraft: IntakeDraft | null;
  authMethods: AuthMethods;
  authMethodsError: string | null;
  isRefreshingAuthMethods: boolean;
  authConfigError: string | null;
  authNotice: string | null;
  isLoading: boolean;
  isSigningOut: boolean;
  setIntakeDraft: (draft: CandidateIntake) => void;
  registerCandidateWithPassword: (input: CandidateRegistration) => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updateEmail: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  sendEmailMagicLink: (email: string, options?: OtpOptions) => Promise<void>;
  sendSmsOtp: (phone: string, options?: OtpOptions) => Promise<void>;
  verifySmsOtp: (phone: string, token: string) => Promise<void>;
  persistDraftAfterVerification: () => Promise<void>;
  updateCandidateProfileIntake: (input: CandidateIntake) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshAuthMethods: () => Promise<void>;
  clearAuthNotice: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type ProfileFetchResult =
  | { ok: true; profile: CandidateProfile }
  | { ok: false; reason: 'not_found' | 'query_error'; message: string };

type CandidatePreferencesRow = {
  cities: CandidateProfile['preferredCities'] | null;
  other_city_text: string | null;
  practice_area: CandidateProfile['practiceArea'];
  other_practice_text: string | null;
};

type CandidateConsentsRow = {
  privacy_policy_accepted: boolean;
  communication_consent_accepted: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function fetchProfile(userId: string): Promise<ProfileFetchResult> {
  try {
    const [profileResult, preferencesResult, consentsResult] = await withTimeout(
      Promise.all([
        supabase
          .from('users_profile')
          .select('id, role, name, email, mobile, onboarding_complete')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('candidate_preferences')
          .select('cities, other_city_text, practice_area, other_practice_text')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('candidate_consents')
          .select('privacy_policy_accepted, communication_consent_accepted')
          .eq('user_id', userId)
          .maybeSingle(),
      ]),
      5000,
      'Profile fetch',
    );

    if (profileResult.error) {
      return {
        ok: false,
        reason: 'query_error',
        message: `Unable to load account profile: ${profileResult.error.message}`,
      };
    }
    if (preferencesResult.error) {
      return {
        ok: false,
        reason: 'query_error',
        message: `Unable to load account profile: ${preferencesResult.error.message}`,
      };
    }
    if (consentsResult.error) {
      return {
        ok: false,
        reason: 'query_error',
        message: `Unable to load account profile: ${consentsResult.error.message}`,
      };
    }
    if (!profileResult.data) {
      return {
        ok: false,
        reason: 'not_found',
        message: 'Your session is active, but no account profile was found.',
      };
    }

    const profileRow = profileResult.data as Pick<
      CandidateProfile,
      'id' | 'role' | 'name' | 'email' | 'mobile' | 'onboarding_complete'
    >;
    const preferences = (preferencesResult.data as CandidatePreferencesRow | null) ?? null;
    const consents = (consentsResult.data as CandidateConsentsRow | null) ?? null;

    return {
      ok: true,
      profile: {
        ...profileRow,
        preferredCities: Array.isArray(preferences?.cities) ? preferences.cities : [],
        otherCityText: preferences?.other_city_text ?? null,
        practiceArea: preferences?.practice_area ?? null,
        otherPracticeText: preferences?.other_practice_text ?? null,
        acceptedPrivacyPolicy: consents?.privacy_policy_accepted ?? false,
        acceptedCommunicationConsent: consents?.communication_consent_accepted ?? false,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'query_error',
      message: `Unable to load account profile: ${extractErrorMessage(error)}`,
    };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [isHydratingProfile, setIsHydratingProfile] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authTransitionVersion, setAuthTransitionVersion] = useState(0);
  const lastHandledUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const authTransitionSeqRef = useRef(0);

  const hydrateProfileForSession = useCallback(
    async (nextSession: Session | null, transitionSeq: number): Promise<void> => {
      if (!isMountedRef.current || transitionSeq !== authTransitionSeqRef.current) {
        return;
      }

      if (!nextSession?.user.id) {
        setProfile(null);
        setProfileLoadError(null);
        setIsHydratingProfile(false);
        return;
      }

      setIsHydratingProfile(true);
      setProfileLoadError(null);

      try {
        let result: ProfileFetchResult | null = null;
        const retryBackoffMs = [0, 150, 400];

        for (let attemptIndex = 0; attemptIndex < retryBackoffMs.length; attemptIndex += 1) {
          const backoff = retryBackoffMs[attemptIndex];
          if (backoff > 0) {
            await sleep(backoff);
          }
          if (!isMountedRef.current || transitionSeq !== authTransitionSeqRef.current) {
            return;
          }

          result = await fetchProfile(nextSession.user.id);
          if (result.ok || result.reason === 'not_found') {
            break;
          }
        }

        if (!isMountedRef.current || transitionSeq !== authTransitionSeqRef.current) {
          return;
        }

        if (result?.ok) {
          setProfile(result.profile);
          setProfileLoadError(null);
        } else {
          setProfile(null);
          setProfileLoadError(
            result?.message ?? 'Unable to load your account profile. Please retry or sign out.',
          );
        }
      } catch (error) {
        if (!isMountedRef.current || transitionSeq !== authTransitionSeqRef.current) {
          return;
        }
        setProfile(null);
        setProfileLoadError(
          `Unable to load your account profile. Please retry or sign out. (${extractErrorMessage(error)})`,
        );
      } finally {
        if (isMountedRef.current && transitionSeq === authTransitionSeqRef.current) {
          setIsHydratingProfile(false);
        }
      }
    },
    [],
  );

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

        const transitionSeq = authTransitionSeqRef.current + 1;
        authTransitionSeqRef.current = transitionSeq;
        if (data.session?.user.id) {
          setIsHydratingProfile(true);
          setProfileLoadError(null);
        }
        setAuthTransitionVersion((previous) => previous + 1);
        setSession(data.session ?? null);
        setNeedsPasswordReset(false);
      } catch {
        // Fail open into auth screens instead of hanging on spinner.
        if (mounted) {
          authTransitionSeqRef.current += 1;
          setAuthTransitionVersion((previous) => previous + 1);
          setSession(null);
          setProfile(null);
          setProfileLoadError(null);
          setIsHydratingProfile(false);
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
      const callbackType = extractCallbackType(url);

      try {
        const handled = await completeAuthSessionFromUrl(url);
        if (handled && mounted) {
          if (callbackType === 'recovery') {
            setNeedsPasswordReset(true);
          }
          setAuthNotice(null);
        }
      } catch (error) {
        if (mounted) {
          if (callbackType === 'recovery') {
            setAuthNotice(mapPasswordAuthErrorToUserMessage(error));
          } else {
            setAuthNotice(mapAuthErrorToUserMessage(error));
          }
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
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const transitionSeq = authTransitionSeqRef.current + 1;
      authTransitionSeqRef.current = transitionSeq;
      if (nextSession?.user.id) {
        setIsHydratingProfile(true);
        setProfileLoadError(null);
      }
      setAuthTransitionVersion((previous) => previous + 1);
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordReset(true);
      } else if (event === 'SIGNED_OUT') {
        setNeedsPasswordReset(false);
      } else if (event === 'USER_UPDATED') {
        setNeedsPasswordReset(false);
      }
    });

    return () => {
      mounted = false;
      isMountedRef.current = false;
      linkSubscription.remove();
      subscription.unsubscribe();
    };
  }, [hydrateProfileForSession, refreshAuthMethods]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const nextSession = session;
    const nextUserId = nextSession?.user.id;
    const transitionSeq = authTransitionSeqRef.current;

    if (!nextUserId) {
      setProfile(null);
      setProfileLoadError(null);
      setIsHydratingProfile(false);
      return;
    }

    if (needsPasswordReset || isSigningOut) {
      return;
    }

    void hydrateProfileForSession(nextSession, transitionSeq);
    void registerPushToken(nextUserId).catch(() => {
      // Non-blocking by design.
    });
  }, [
    authTransitionVersion,
    hydrateProfileForSession,
    isLoading,
    isSigningOut,
    needsPasswordReset,
    session,
  ]);

  useEffect(() => {
    if (isLoading || isSigningOut || needsPasswordReset) {
      return;
    }

    const userId = session?.user?.id;
    const sessionEmail = session?.user?.email?.trim().toLowerCase();
    const profileEmail = profile?.email?.trim().toLowerCase();

    if (!userId || !sessionEmail || !profile || profileEmail === sessionEmail) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const { error } = await supabase.from('users_profile').update({ email: sessionEmail }).eq('id', userId);
      if (error || cancelled) {
        return;
      }

      setProfile((previous) => {
        if (!previous || previous.id !== userId) {
          return previous;
        }
        return {
          ...previous,
          email: sessionEmail,
        };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    isSigningOut,
    needsPasswordReset,
    profile,
    session?.user?.email,
    session?.user?.id,
  ]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      isHydratingProfile,
      profileLoadError,
      needsPasswordReset,
      intakeDraft,
      authMethods,
      authMethodsError,
      isRefreshingAuthMethods,
      authConfigError,
      authNotice,
      isLoading,
      isSigningOut,
      setIntakeDraft: (draft) => setIntakeDraftState(draft),
      registerCandidateWithPassword: async (input: CandidateRegistration) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }
        try {
          const normalizedPhone = input.mobile ? normalizePhoneForAuthOrThrow(input.mobile) : undefined;
          const result = await callPublicFunctionJson<{
            ok: true;
            session: PasswordAuthSessionPayload;
            user_id: string;
          }>('register_candidate_password', {
            ...input,
            email: input.email.trim().toLowerCase(),
            ...(normalizedPhone ? { mobile: normalizedPhone } : {}),
          });

          await setSupabaseSessionFromPasswordAuth(result.session);
        } catch (error) {
          throw new Error(mapRegistrationErrorToUserMessage(error));
        }
      },
      signInWithEmailPassword: async (email: string, password: string) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }
        try {
          const result = await callPublicFunctionJson<{
            ok: true;
            session: PasswordAuthSessionPayload;
          }>('mobile_sign_in_with_identifier_password', {
            identifier: email.trim().toLowerCase(),
            password,
          });
          await setSupabaseSessionFromPasswordAuth(result.session);
        } catch (error) {
          throw new Error(mapPasswordAuthErrorToUserMessage(error));
        }
      },
      requestPasswordReset: async (email: string) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }
        if (authRedirectUrl?.startsWith('exp://')) {
          throw new Error(
            'Password reset links are not supported in Expo Go. Use a development build (zenithlegal://auth/callback) to reset your password on mobile.',
          );
        }
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) {
          throw new Error('Enter your email to reset your password.');
        }

        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: authRedirectUrl,
        });
        if (error) {
          throw new Error(mapPasswordAuthErrorToUserMessage(error));
        }
      },
      updateEmail: async (email: string) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }

        const nextEmail = email.trim().toLowerCase();
        if (!nextEmail) {
          throw new Error('Enter an email address.');
        }

        const { error } = await supabase.auth.updateUser({ email: nextEmail });
        if (error) {
          throw new Error(extractErrorMessage(error));
        }
      },
      updatePassword: async (newPassword: string) => {
        if (authConfigError) {
          throw new Error(authConfigError);
        }
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
          throw new Error(mapPasswordAuthErrorToUserMessage(error));
        }
        setNeedsPasswordReset(false);
        setAuthNotice(null);
      },
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

        const { data, error } = await supabase.functions.invoke(
          'create_or_update_candidate_profile',
          {
            body: intakeDraft,
          },
        );

        if (error) {
          throw new Error(await extractFunctionInvokeErrorMessage(error, data));
        }

        if (session?.user.id) {
          const transitionSeq = authTransitionSeqRef.current + 1;
          authTransitionSeqRef.current = transitionSeq;
          await hydrateProfileForSession(session, transitionSeq);
        }
      },
      updateCandidateProfileIntake: async (input: CandidateIntake) => {
        if (!session?.user.id) {
          throw new Error('You must be signed in to update your profile.');
        }

        const email = (profile?.email ?? session.user.email ?? '').trim().toLowerCase();
        if (!email) {
          throw new Error('Your account email is unavailable. Please try again or sign in again.');
        }

        const { data, error } = await supabase.functions.invoke('create_or_update_candidate_profile', {
          body: {
            ...input,
            email,
          },
        });

        if (error) {
          throw new Error(await extractFunctionInvokeErrorMessage(error, data));
        }

        const transitionSeq = authTransitionSeqRef.current + 1;
        authTransitionSeqRef.current = transitionSeq;
        await hydrateProfileForSession(session, transitionSeq);
      },
      signOut: async () => {
        setIsSigningOut(true);
        authTransitionSeqRef.current += 1;
        setAuthTransitionVersion((previous) => previous + 1);
        setNeedsPasswordReset(false);
        setAuthNotice(null);
        setProfileLoadError(null);
        setIsHydratingProfile(false);
        setProfile(null);
        setSession(null);
        try {
          const { error } = await supabase.auth.signOut();
          if (error) {
            throw error;
          }
        } catch (error) {
          setAuthNotice(mapPasswordAuthErrorToUserMessage(error));
        } finally {
          setIsSigningOut(false);
        }
      },
      refreshProfile: async () => {
        if (!session?.user.id) {
          return;
        }
        const transitionSeq = authTransitionSeqRef.current + 1;
        authTransitionSeqRef.current = transitionSeq;
        await hydrateProfileForSession(session, transitionSeq);
      },
      refreshAuthMethods,
      clearAuthNotice: () => setAuthNotice(null),
    }),
    [
      authConfigError,
      authMethods,
      authMethodsError,
      authNotice,
      hydrateProfileForSession,
      intakeDraft,
      isHydratingProfile,
      isLoading,
      isRefreshingAuthMethods,
      isSigningOut,
      needsPasswordReset,
      profile,
      profileLoadError,
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
