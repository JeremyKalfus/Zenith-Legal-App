import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const enqueueSchema = z.object({
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

const processSchema = z.object({
  mode: z.literal('process').optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

type DeliveryRow = {
  id: string;
  user_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  send_after_utc: string;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
};

type ExpoPushResponse = {
  data?: Array<{
    status?: string;
    message?: string;
    details?: {
      error?: string;
    };
  }>;
  errors?: Array<{
    code?: string;
    message?: string;
  }>;
};

function isExpoPushToken(value: string): boolean {
  const token = value.trim();
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}

function buildPushMessage(eventType: string, payload: Record<string, unknown> | null) {
  switch (eventType) {
    case 'appointment.created':
      if (payload && payload.status === 'scheduled') {
        return {
          title: 'Appointment scheduled',
          body: 'A recruiter scheduled an appointment for you.',
        };
      }
      return {
        title: 'Appointment requested',
        body: 'Your appointment request was received.',
      };
    case 'appointment.updated': {
      const decision =
        payload && typeof payload.decision === 'string' ? payload.decision.toLowerCase() : null;
      if (decision === 'accepted' || decision === 'scheduled') {
        return {
          title: 'Appointment scheduled',
          body: 'A recruiter scheduled your appointment.',
        };
      }
      if (decision === 'declined') {
        return {
          title: 'Appointment declined',
          body: 'A recruiter declined your appointment request.',
        };
      }
      return {
        title: 'Appointment updated',
        body: 'Your appointment details were updated.',
      };
    }
    case 'appointment.cancelled':
      return {
        title: 'Appointment cancelled',
        body: 'Your appointment was cancelled.',
      };
    case 'appointment.reminder':
      return {
        title: 'Appointment reminder',
        body: 'Your appointment starts in 15 minutes.',
      };
    case 'firm_status.updated': {
      const status = payload && typeof payload.status === 'string' ? payload.status : null;
      return {
        title: 'Firm status updated',
        body: status ? `Status changed: ${status}` : 'Your firm submission status changed.',
      };
    }
    case 'message.new':
      return {
        title: 'New message from Zenith Legal',
        body: 'Open the app to read your new message.',
      };
    default: {
      if (eventType.startsWith('message.')) {
        return {
          title: 'New message from Zenith Legal',
          body: 'Open the app to read your new message.',
        };
      }
      return {
        title: 'Zenith Legal update',
        body: 'You have a new notification.',
      };
    }
  }
}

async function ensureDispatcherAuthorized(request: Request): Promise<void> {
  const dispatchSecret = Deno.env.get('DISPATCH_SECRET');
  const incomingSecret = request.headers.get('x-dispatch-secret');

  if (!dispatchSecret || incomingSecret !== dispatchSecret) {
    throw new Error('Unauthorized dispatcher request');
  }
}

async function enqueueEvents(payload: z.infer<typeof enqueueSchema>) {
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

  return jsonResponse({ success: true, mode: 'enqueue', results });
}

async function claimQueuedPushDelivery(
  serviceClient: ReturnType<typeof createServiceClient>,
  deliveryId: string,
) {
  const { data, error } = await serviceClient
    .from('notification_deliveries')
    .update({ status: 'processing' })
    .eq('id', deliveryId)
    .eq('status', 'queued')
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function markDeliveryStatus(
  serviceClient: ReturnType<typeof createServiceClient>,
  deliveryId: string,
  status: 'sent' | 'failed',
) {
  const { error } = await serviceClient
    .from('notification_deliveries')
    .update({ status })
    .eq('id', deliveryId);

  if (error) {
    throw new Error(error.message);
  }
}

async function revokeDeviceToken(
  serviceClient: ReturnType<typeof createServiceClient>,
  tokenValue: string,
) {
  await serviceClient
    .from('push_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('expo_push_token', tokenValue)
    .is('revoked_at', null);
}

async function sendExpoPushBatch(
  messages: Array<{
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    sound: 'default';
  }>,
) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Expo Push API error (${response.status})${text ? `: ${text.slice(0, 300)}` : ''}`,
    );
  }

  return (await response.json()) as ExpoPushResponse;
}

async function revokeStaleTokens(
  serviceClient: ReturnType<typeof createServiceClient>,
  tickets: NonNullable<ExpoPushResponse['data']>,
  tokenRows: PushTokenRow[],
): Promise<boolean> {
  let hasSuccess = false;

  for (let i = 0; i < tickets.length; i += 1) {
    const ticket = tickets[i];
    if (ticket?.status === 'ok') {
      hasSuccess = true;
      continue;
    }
    const tokenRow = tokenRows[i];
    if (ticket?.details?.error === 'DeviceNotRegistered' && tokenRow) {
      await revokeDeviceToken(serviceClient, tokenRow.expo_push_token);
    }
  }

  return hasSuccess;
}

type DeliveryResult = { outcome: 'sent' | 'failed' | 'skipped'; detail: Record<string, unknown> };

async function processSingleDelivery(
  serviceClient: ReturnType<typeof createServiceClient>,
  delivery: DeliveryRow,
  tokensByUser: Map<string, PushTokenRow[]>,
): Promise<DeliveryResult> {
  const claimed = await claimQueuedPushDelivery(serviceClient, delivery.id);
  if (!claimed) {
    return { outcome: 'skipped', detail: { id: delivery.id, status: 'skipped', reason: 'not_queued_anymore' } };
  }

  try {
    const validTokenRows = (tokensByUser.get(delivery.user_id ?? '') ?? []).filter((row) =>
      isExpoPushToken(row.expo_push_token),
    );

    if (validTokenRows.length === 0) {
      await markDeliveryStatus(serviceClient, delivery.id, 'failed');
      return { outcome: 'failed', detail: { id: delivery.id, status: 'failed', reason: 'no_valid_push_tokens' } };
    }

    const message = buildPushMessage(delivery.event_type, delivery.payload ?? {});
    const expoResponse = await sendExpoPushBatch(
      validTokenRows.map((row) => ({
        to: row.expo_push_token,
        title: message.title,
        body: message.body,
        data: { event_type: delivery.event_type, delivery_id: delivery.id, ...(delivery.payload ?? {}) },
        sound: 'default',
      })),
    );

    const hasSuccess = await revokeStaleTokens(serviceClient, expoResponse.data ?? [], validTokenRows);
    const finalStatus = hasSuccess ? 'sent' : 'failed';
    await markDeliveryStatus(serviceClient, delivery.id, finalStatus);
    return {
      outcome: finalStatus,
      detail: {
        id: delivery.id,
        status: finalStatus,
        token_count: validTokenRows.length,
        ...(hasSuccess ? {} : { expo_errors: expoResponse.errors ?? [] }),
      },
    };
  } catch (error) {
    await markDeliveryStatus(serviceClient, delivery.id, 'failed').catch(() => undefined);
    return { outcome: 'failed', detail: { id: delivery.id, status: 'failed', reason: (error as Error).message } };
  }
}

async function fetchTokensByUser(
  serviceClient: ReturnType<typeof createServiceClient>,
  userIds: string[],
): Promise<Map<string, PushTokenRow[]>> {
  const { data: tokenRows, error: tokenError } = await serviceClient
    .from('push_tokens')
    .select('id,user_id,expo_push_token')
    .in('user_id', userIds)
    .is('revoked_at', null);

  if (tokenError) {
    throw new Error(tokenError.message);
  }

  const tokensByUser = new Map<string, PushTokenRow[]>();
  for (const row of (tokenRows ?? []) as PushTokenRow[]) {
    const list = tokensByUser.get(row.user_id) ?? [];
    list.push(row);
    tokensByUser.set(row.user_id, list);
  }
  return tokensByUser;
}

async function processQueuedPushDeliveries(payload: z.infer<typeof processSchema>) {
  const serviceClient = createServiceClient();
  const limit = payload.limit ?? 50;

  const { data: queuedRows, error: queuedError } = await serviceClient
    .from('notification_deliveries')
    .select('id,user_id,event_type,payload,status,send_after_utc')
    .eq('channel', 'push')
    .eq('status', 'queued')
    .lte('send_after_utc', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);

  if (queuedError) {
    return errorResponse(queuedError.message, 500);
  }

  const allQueuedRows = (queuedRows ?? []) as DeliveryRow[];
  const deliveries = allQueuedRows.filter((row) => !!row.user_id);

  if (deliveries.length === 0) {
    return jsonResponse({
      success: true,
      mode: 'process',
      processed_count: 0,
      sent_count: 0,
      failed_count: 0,
      skipped_count: allQueuedRows.length,
      email_queued_count: 0,
      results: [],
    });
  }

  const userIds = Array.from(new Set(deliveries.map((row) => row.user_id!).filter(Boolean)));
  let tokensByUser: Map<string, PushTokenRow[]>;
  try {
    tokensByUser = await fetchTokensByUser(serviceClient, userIds);
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = allQueuedRows.length - deliveries.length;
  const results: Array<Record<string, unknown>> = [];

  for (const delivery of deliveries) {
    const { outcome, detail } = await processSingleDelivery(serviceClient, delivery, tokensByUser);
    if (outcome === 'sent') sentCount += 1;
    else if (outcome === 'failed') failedCount += 1;
    else skippedCount += 1;
    results.push(detail);
  }

  const { count: emailQueuedCount } = await serviceClient
    .from('notification_deliveries')
    .select('*', { count: 'exact', head: true })
    .eq('channel', 'email')
    .eq('status', 'queued');

  return jsonResponse({
    success: true,
    mode: 'process',
    processed_count: deliveries.length,
    sent_count: sentCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    email_queued_count: emailQueuedCount ?? 0,
    results,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    await ensureDispatcherAuthorized(request);

    const rawBody = await request.json().catch(() => ({}));

    if (
      typeof rawBody === 'object' &&
      rawBody !== null &&
      'events' in rawBody &&
      Array.isArray((rawBody as Record<string, unknown>).events)
    ) {
      return await enqueueEvents(enqueueSchema.parse(rawBody));
    }

    return await processQueuedPushDeliveries(processSchema.parse(rawBody));
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Unauthorized dispatcher request') {
      return errorResponse(message, 401);
    }
    return errorResponse(message, 500);
  }
});
