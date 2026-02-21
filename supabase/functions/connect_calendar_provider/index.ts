import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const schema = z.object({
  provider: z.enum(['google', 'microsoft']),
  oauth_code: z.string().min(1),
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

    const digestBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload.oauth_code),
    );
    const digest = Array.from(new Uint8Array(digestBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    const tokenBlob = {
      provider: payload.provider,
      connected_at: new Date().toISOString(),
      oauth_code_hash: digest,
    };

    const { data, error } = await client
      .from('calendar_connections')
      .upsert(
        {
          user_id: userId,
          provider: payload.provider,
          oauth_tokens_encrypted: JSON.stringify(tokenBlob),
          sync_state: {
            state: 'connected_pending_exchange',
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
    return errorResponse((error as Error).message, 500);
  }
});
