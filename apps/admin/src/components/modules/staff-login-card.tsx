'use client';

import { useState } from 'react';
import { supabaseClient } from '@/lib/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export function StaffLoginCard() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff Login</CardTitle>
        <CardDescription>
          Invite-only staff access via Supabase magic link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="staff@zenithlegal.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
        />
        <Button
          disabled={busy || !email}
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await supabaseClient.auth.signInWithOtp({ email });
              if (error) {
                throw error;
              }
              setMessage('Magic link sent. Open the link to continue.');
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send Magic Link
        </Button>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
