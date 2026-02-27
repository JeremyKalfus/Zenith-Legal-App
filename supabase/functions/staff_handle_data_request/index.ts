import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const requestActionSchema = z.object({
  request_id: z.string().uuid(),
  action: z.enum(['export', 'delete']),
  notes: z.string().optional(),
});


Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const actorUserId = userId as string;
      const serviceClient = createServiceClient();
      const parsedBody = requestActionSchema.safeParse(await request.json());
      if (!parsedBody.success) {
        return errorResponse('Invalid data request payload', 422, 'invalid_payload');
      }
      const payload = parsedBody.data;

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
    },
    { auth: 'staff' },
  ),
);
