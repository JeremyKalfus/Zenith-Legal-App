import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { env } from '../config/env';
import { supabase } from '../lib/supabase';
import type { RecruiterContact } from '../types/domain';

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
  const [contact, setContact] = useState<RecruiterContact>(defaultContact);

  const refresh = async () => {
    const { data } = await supabase
      .from('recruiter_contact_config')
      .select('phone,email')
      .eq('is_active', true)
      .maybeSingle();

    if (data?.phone && data?.email) {
      setContact({ phone: data.phone, email: data.email });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(
    () => ({
      contact,
      refresh,
    }),
    [contact],
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
