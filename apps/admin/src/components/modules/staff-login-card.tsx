'use client';

import { useState } from 'react';
import { supabaseClient } from '@/lib/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export function StaffLoginCard() {
  const [email, setEmail] = useState('mason@zenithlegal.com');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff Login</CardTitle>
        <CardDescription>
          Staff access via email and password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
        />
        <Input
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
        />
        <Button
          disabled={busy || !email || !password}
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await supabaseClient.auth.signInWithPassword({
                email: email.trim(),
                password,
              });
              if (error) {
                throw error;
              }
              setMessage('Signed in. Redirecting...');
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Signing in...' : 'Sign In'}
        </Button>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
