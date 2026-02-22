'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase-client';

export function StaffAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const redirectIfSignedIn = async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (!mounted || error) {
        return;
      }

      if (data.session) {
        router.replace('/dashboard');
      }
    };

    void redirectIfSignedIn();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace('/dashboard');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
