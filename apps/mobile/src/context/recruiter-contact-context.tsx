import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { env } from '../config/env';
import { supabase } from '../lib/supabase';
import type { RecruiterContact } from '../types/domain';
import { useAuth } from './auth-context';
import { resolveRecruiterContact } from '../features/recruiter-contact-resolver';

const defaultContact: RecruiterContact = {
  phone: env.supportPhone,
  email: env.supportEmail,
};

type RecruiterContactContextValue = {
  contact: RecruiterContact;
  refresh: () => Promise<void>;
};

const RecruiterContactContext = createContext<RecruiterContactContextValue | undefined>(
  undefined,
);

export function RecruiterContactProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, session } = useAuth();
  const [contact, setContact] = useState<RecruiterContact>(defaultContact);

  const refresh = useCallback(async () => {
    const candidateUserId =
      profile?.role === 'candidate' ? profile.id : null;

    const { data: globalData } = await supabase
      .from('recruiter_contact_config')
      .select('phone,email')
      .eq('is_active', true)
      .maybeSingle();

    const globalContact =
      globalData?.phone && globalData?.email
        ? { phone: globalData.phone, email: globalData.email }
        : null;

    let candidateOverride: RecruiterContact | null = null;
    if (candidateUserId) {
      const { data: overrideData } = await supabase
        .from('candidate_recruiter_contact_overrides')
        .select('phone,email')
        .eq('candidate_user_id', candidateUserId)
        .maybeSingle();

      if (overrideData?.phone && overrideData?.email) {
        candidateOverride = {
          phone: overrideData.phone,
          email: overrideData.email,
        };
      }
    }

    setContact(
      resolveRecruiterContact({
        defaultContact,
        globalContact,
        candidateOverride,
      }),
    );
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    void refresh();
  }, [refresh, profile?.id, profile?.role, session?.user?.id]);

  const value = useMemo(
    () => ({
      contact,
      refresh,
    }),
    [contact, refresh],
  );

  return (
    <RecruiterContactContext.Provider value={value}>
      {children}
    </RecruiterContactContext.Provider>
  );
}

export function useRecruiterContact(): RecruiterContactContextValue {
  const context = useContext(RecruiterContactContext);
  if (!context) {
    throw new Error(
      'useRecruiterContact must be used within RecruiterContactProvider',
    );
  }

  return context;
}
