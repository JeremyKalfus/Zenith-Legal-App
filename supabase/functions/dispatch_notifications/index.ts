import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const schema = z.object({
  events: z
    .array(
      z.object({
        user_id: z.string().uuid(),
        event_type: z.string().min(1),
        payload: z.record(z.unknown()).default({}),
      }),
    )
    .min(1),
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const dispatchSecret = Deno.env.get('DISPATCH_SECRET');
    const incomingSecret = request.headers.get('x-dispatch-secret');

    if (!dispatchSecret || incomingSecret !== dispatchSecret) {
      return errorResponse('Unauthorized dispatcher request', 401);
    }

    const payload = schema.parse(await request.json());
    const serviceClient = createServiceClient();

    const results: Array<Record<string, unknown>> = [];

    for (const event of payload.events) {
      const { data: preference } = await serviceClient
        .from('notification_preferences')
        .select('push_enabled,email_enabled')
        .eq('user_id', event.user_id)
        .maybeSingle();

      const pushEnabled = preference?.push_enabled ?? true;
      const emailEnabled = preference?.email_enabled ?? true;

      if (pushEnabled) {
        await serviceClient.from('notification_deliveries').insert({
          user_id: event.user_id,
          channel: 'push',
          event_type: event.event_type,
          payload: event.payload,
          status: 'queued',
        });
      }

      if (emailEnabled) {
        await serviceClient.from('notification_deliveries').insert({
          user_id: event.user_id,
          channel: 'email',
          event_type: event.event_type,
          payload: event.payload,
          status: 'queued',
        });
      }

      results.push({
        user_id: event.user_id,
        push_enabled: pushEnabled,
        email_enabled: emailEnabled,
      });
    }

    return jsonResponse({ success: true, results });
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }
});
