import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { assertStaff, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const schema = z.object({
  request_id: z.string().uuid(),
  action: z.enum(['export', 'delete']),
  notes: z.string().optional(),
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const actorUserId = await assertStaff(authHeader);
    const serviceClient = createServiceClient();
    const payload = schema.parse(await request.json());

    const { data: before } = await serviceClient
      .from('support_data_requests')
      .select('*')
      .eq('id', payload.request_id)
      .maybeSingle();

    const { data, error } = await serviceClient
      .from('support_data_requests')
      .update({
        status: 'completed',
        handled_by_staff: actorUserId,
        notes: payload.notes ?? before?.notes ?? null,
      })
      .eq('id', payload.request_id)
      .select('*')
      .single();

    if (error || !data) {
      return errorResponse(error?.message ?? 'Unable to process request', 400);
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId,
      action: `staff_handle_${payload.action}_request`,
      entityType: 'support_data_requests',
      entityId: payload.request_id,
      beforeJson: before ?? null,
      afterJson: data,
    });

    return jsonResponse({ success: true, request: data });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('Unauthorized')) {
      return errorResponse(message, 401);
    }
    if (message === 'Forbidden: staff access required') {
      return errorResponse(message, 403);
    }
    return errorResponse(message, 500);
  }
});
