import { z } from 'npm:zod@4.3.6';
import { createServiceClient } from '../_shared/supabase.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { normalizeUsPhoneForAuth } from '../_shared/phone.ts';
import { requestPasswordGrant, toSessionResponse } from '../_shared/password-auth.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const requestSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(256),
});

function structuredError(code: string, message: string, status: number): Response {
  return jsonResponse({ ok: false, code, error: message }, status);
}

async function passwordGrant(params: { email: string; password: string }) {
  const { payload, response } = await requestPasswordGrant(params);
  if (!response.ok) {
    throw new Error('invalid_credentials');
  }

  return payload;
}


Deno.serve(
  createEdgeHandler(
    async ({ request }) => {
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
          const mobile = normalizeUsPhoneForAuth(trimmedIdentifier);
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
          session: toSessionResponse(sessionPayload),
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
    },
    {
      method: 'POST',
      onError: (message) => errorResponse(message, 500),
    },
  ),
);
