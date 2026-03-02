import { z } from 'npm:zod@4.3.6';
import { createServiceClient } from '../_shared/supabase.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const requestSchema = z.object({
  email: z.string().trim().email().max(255),
});

function structuredError(code: string, message: string, status: number): Response {
  return jsonResponse({ ok: false, code, error: message }, status);
}

Deno.serve(
  createEdgeHandler(
    async ({ request }) => {
      try {
        const payload = await request.json();
        const parsed = requestSchema.safeParse(payload);
        if (!parsed.success) {
          return structuredError('validation_error', 'Enter a valid email address.', 422);
        }

        const email = parsed.data.email.trim().toLowerCase();
        const serviceClient = createServiceClient();

        const { data: existingProfiles, error } = await serviceClient
          .from('users_profile')
          .select('id')
          .ilike('email', email)
          .limit(1);

        if (error) {
          return structuredError('database_error', 'Unable to validate email address', 500);
        }

        if (Array.isArray(existingProfiles) && existingProfiles.length > 0) {
          return structuredError(
            'duplicate_email',
            'An account with this email already exists. Sign in or reset your password.',
            409,
          );
        }

        return jsonResponse({ ok: true, available: true });
      } catch {
        return structuredError('validation_error', 'Enter a valid email address.', 422);
      }
    },
    {
      method: 'POST',
      onError: (message) => errorResponse(message, 500),
    },
  ),
);
