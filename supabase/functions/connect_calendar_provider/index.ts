import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

type ConnectCalendarPayload = {
  provider: 'google' | 'apple';
  oauth_code?: string;
  oauth_tokens?: Record<string, unknown>;
};

function parsePayload(input: unknown): ConnectCalendarPayload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid payload: body must be an object.');
  }

  const record = input as Record<string, unknown>;
  const provider = record.provider;
  if (provider !== 'google' && provider !== 'apple') {
    throw new Error('Invalid payload: provider must be google or apple.');
  }

  const oauthCode =
    typeof record.oauth_code === 'string' && record.oauth_code.trim().length > 0
      ? record.oauth_code.trim()
      : undefined;
  const oauthTokens =
    record.oauth_tokens && typeof record.oauth_tokens === 'object' && !Array.isArray(record.oauth_tokens)
      ? (record.oauth_tokens as Record<string, unknown>)
      : undefined;

  if (!oauthCode && !oauthTokens) {
    throw new Error('Invalid payload: oauth_code or oauth_tokens is required.');
  }

  return {
    provider,
    oauth_code: oauthCode,
    oauth_tokens: oauthTokens,
  };
}


Deno.serve(
  createEdgeHandler(
    async ({ request, authHeader, userId }) => {
      const resolvedUserId = userId as string;
      const client = createAuthedClient(authHeader);
      const serviceClient = createServiceClient();

      const payload = parsePayload(await request.json());
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
            user_id: resolvedUserId,
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
        actorUserId: resolvedUserId,
        action: 'connect_calendar_provider',
        entityType: 'calendar_connections',
        entityId: data.id,
        afterJson: {
          provider: payload.provider,
        },
      });

      return jsonResponse({ success: true, connection: data });
    },
    { auth: 'user' },
  ),
);
