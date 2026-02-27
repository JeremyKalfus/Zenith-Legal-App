type PasswordGrantParams = {
  email: string;
  password: string;
};

type PasswordGrantPayload = Record<string, unknown>;

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export async function requestPasswordGrant(
  params: PasswordGrantParams,
): Promise<{ payload: PasswordGrantPayload; response: Response }> {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: anonKey,
  };

  if (!anonKey.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${anonKey}`;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: params.email, password: params.password }),
  });

  const payload = (await response.json().catch(() => ({}))) as PasswordGrantPayload;
  return { payload, response };
}

export function toSessionResponse(payload: PasswordGrantPayload) {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    expires_at: payload.expires_at,
    token_type: payload.token_type,
    user: payload.user,
  };
}
