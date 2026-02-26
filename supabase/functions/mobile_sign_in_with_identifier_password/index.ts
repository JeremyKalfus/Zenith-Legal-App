import { z } from 'npm:zod@4.3.6';
import { createServiceClient } from '../_shared/supabase.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { sanitizePhoneInput } from '../_shared/phone.ts';

const requestSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(256),
});

function structuredError(code: string, message: string, status: number): Response {
  return jsonResponse({ ok: false, code, error: message }, status);
}

function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function normalizePhoneNumber(input: string): string {
  const sanitized = sanitizePhoneInput(input);
  if (!sanitized) {
    throw new Error('invalid_identifier');
  }

  if (sanitized.startsWith('00')) {
    return normalizePhoneNumber(`+${sanitized.slice(2)}`);
  }

  let candidate = sanitized;
  if (!candidate.startsWith('+')) {
    if (/^\d{10}$/.test(candidate)) {
      candidate = `+1${candidate}`;
    } else if (/^1\d{10}$/.test(candidate)) {
      candidate = `+${candidate}`;
    } else {
      throw new Error('invalid_identifier');
    }
  }

  if (!isE164Phone(candidate)) {
    throw new Error('invalid_identifier');
  }

  return candidate;
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function passwordGrant(params: { email: string; password: string }) {
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

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('invalid_credentials');
  }

  return payload;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return structuredError('validation_error', 'Invalid credentials', 422);
    }

    const { identifier, password } = parsed.data;
    const trimmedIdentifier = identifier.trim();
    const serviceClient = createServiceClient();

    let email = '';

    if (trimmedIdentifier.includes('@')) {
      email = trimmedIdentifier.toLowerCase();
    } else {
      const mobile = normalizePhoneNumber(trimmedIdentifier);
      const { data, error } = await serviceClient
        .from('users_profile')
        .select('email')
        .eq('mobile', mobile)
        .limit(2);

      if (error || !data || data.length !== 1) {
        throw new Error('invalid_credentials');
      }

      email = String(data[0].email ?? '').trim().toLowerCase();
      if (!email) {
        throw new Error('invalid_credentials');
      }
    }

    const sessionPayload = await passwordGrant({ email, password });

    return jsonResponse({
      ok: true,
      session: {
        access_token: sessionPayload.access_token,
        refresh_token: sessionPayload.refresh_token,
        expires_in: sessionPayload.expires_in,
        expires_at: sessionPayload.expires_at,
        token_type: sessionPayload.token_type,
        user: sessionPayload.user,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_credentials';
    if (code === 'invalid_identifier') {
      return structuredError(
        'invalid_identifier',
        'Enter a valid mobile number. US numbers can be entered without +1.',
        422,
      );
    }

    return structuredError('invalid_credentials', 'Invalid email/phone or password.', 401);
  }
});
