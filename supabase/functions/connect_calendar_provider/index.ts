import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const schema = z
  .object({
    provider: z.enum(['google', 'apple']),
    oauth_code: z.string().min(1).optional(),
    oauth_tokens: z.record(z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.oauth_code && !value.oauth_tokens) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'oauth_code or oauth_tokens is required',
        path: ['oauth_code'],
      });
    }
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const userId = await getCurrentUserId(authHeader);
    const client = createAuthedClient(authHeader);
    const serviceClient = createServiceClient();

    const payload = schema.parse(await request.json());

    const oauthCode = payload.oauth_code ?? '';
    const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(oauthCode));
    const digest = Array.from(new Uint8Array(digestBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    const tokenBlob = {
      provider: payload.provider,
      connected_at: new Date().toISOString(),
      oauth_code_hash: oauthCode ? digest : null,
      oauth_tokens: payload.oauth_tokens ?? null,
    };

    const { data, error } = await client
      .from('calendar_connections')
      .upsert(
        {
          user_id: userId,
          provider: payload.provider,
          oauth_tokens_encrypted: JSON.stringify(tokenBlob),
          sync_state: {
            state: payload.oauth_tokens ? 'connected' : 'connected_pending_exchange',
            last_attempt_at: new Date().toISOString(),
          },
        },
        { onConflict: 'user_id,provider' },
      )
      .select('*')
      .single();

    if (error || !data) {
      return errorResponse(error?.message ?? 'Unable to connect provider', 400);
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: userId,
      action: 'connect_calendar_provider',
      entityType: 'calendar_connections',
      entityId: data.id,
      afterJson: {
        provider: payload.provider,
      },
    });

    return jsonResponse({ success: true, connection: data });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('Unauthorized')) {
      return errorResponse(message, 401);
    }
    return errorResponse(message, 500);
  }
});
