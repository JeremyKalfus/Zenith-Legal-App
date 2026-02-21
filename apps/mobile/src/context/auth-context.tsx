import type { CandidateIntake } from '@zenith/shared';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { CandidateProfile, IntakeDraft } from '../types/domain';
import { registerPushToken } from '../lib/notifications';

type AuthContextValue = {
  session: Session | null;
  profile: CandidateProfile | null;
  intakeDraft: IntakeDraft | null;
  isLoading: boolean;
  setIntakeDraft: (draft: CandidateIntake) => void;
  sendEmailMagicLink: (email: string) => Promise<void>;
  sendSmsOtp: (phone: string) => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session ?? null);
      if (data.session?.user.id) {
        const nextProfile = await fetchProfile(data.session.user.id);
        setProfile(nextProfile);
        await registerPushToken(data.session.user.id);
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user.id) {
        const nextProfile = await fetchProfile(nextSession.user.id);
        setProfile(nextProfile);
        await registerPushToken(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      intakeDraft,
      isLoading,
      setIntakeDraft: (draft) => setIntakeDraftState(draft),
      sendEmailMagicLink: async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) {
          throw error;
        }
      },
      sendSmsOtp: async (phone: string) => {
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) {
          throw error;
        }
      },
      verifySmsOtp: async (phone: string, token: string) => {
        const { error } = await supabase.auth.verifyOtp({
          phone,
          token,
          type: 'sms',
        });
        if (error) {
          throw error;
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
    [intakeDraft, isLoading, profile, session],
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
