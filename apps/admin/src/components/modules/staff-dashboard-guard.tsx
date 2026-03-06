'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureValidSession, supabaseClient } from '@/lib/supabase-client';

type GuardState = 'checking' | 'allowed' | 'denied';

export function StaffDashboardGuard({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>('checking');

  useEffect(() => {
    let mounted = true;

    const checkAccess = async () => {
      let sessionData;
      try {
        const session = await ensureValidSession();
        sessionData = { session };
      } catch {
        if (!mounted) {
          return;
        }
        setState('denied');
        router.replace('/');
        return;
      }

      if (!mounted) {
        return;
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from('users_profile')
        .select('role')
        .eq('id', sessionData.session.user.id)
        .single();

      if (!mounted) {
        return;
      }

      if (profileError || profile?.role !== 'staff') {
        await supabaseClient.auth.signOut();
        setState('denied');
        router.replace('/');
        return;
      }

      setState('allowed');
    };

    void checkAccess();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState('denied');
        router.replace('/');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (state !== 'allowed') {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-12">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Checking staff access...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
