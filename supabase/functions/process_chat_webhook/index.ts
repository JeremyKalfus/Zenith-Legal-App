import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const signature = request.headers.get('x-signature');
    const expectedSignature = Deno.env.get('STREAM_WEBHOOK_SIGNATURE');

    if (!expectedSignature || signature !== expectedSignature) {
      return errorResponse('Invalid webhook signature', 401);
    }

    const payload = await request.json();
    const serviceClient = createServiceClient();

    const userId = payload.user?.id ?? null;
    const eventType = payload.type ?? 'chat.unknown';

    await serviceClient.from('notification_deliveries').insert({
      user_id: userId,
      channel: 'push',
      event_type: eventType,
      payload,
      status: 'queued',
    });

    await serviceClient.from('audit_events').insert({
      actor_user_id: null,
      action: 'process_chat_webhook',
      entity_type: 'stream_webhook',
      entity_id: payload.message?.id ?? crypto.randomUUID(),
      after_json: payload,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }
});
