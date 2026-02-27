import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const bodySchema = z.object({
  assignment_id: z.string().uuid(),
});


Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const actorUserId = userId as string;
      const serviceClient = createServiceClient();
      const parsedBody = bodySchema.safeParse(await request.json());
      if (!parsedBody.success) {
        return errorResponse('Invalid assignment payload', 422, 'invalid_payload');
      }
      const payload = parsedBody.data;

      const { data: before, error: beforeError } = await serviceClient
        .from('candidate_firm_assignments')
        .select('*')
        .eq('id', payload.assignment_id)
        .maybeSingle();

      if (beforeError) {
        return errorResponse(beforeError.message, 400, 'assignment_lookup_failed');
      }
      if (!before) {
        return errorResponse('Assignment not found', 404, 'assignment_not_found');
      }

      const { error: deleteError } = await serviceClient
        .from('candidate_firm_assignments')
        .delete()
        .eq('id', payload.assignment_id);

      if (deleteError) {
        return errorResponse(deleteError.message, 400, 'unassign_failed');
      }

      await serviceClient.from('notification_deliveries').insert({
        user_id: before.candidate_user_id,
        channel: 'push',
        event_type: 'firm_assignment.removed',
        payload: {
          assignment_id: before.id,
          firm_id: before.firm_id,
        },
        status: 'queued',
      });

      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'staff_unassign_firm_from_candidate',
        entityType: 'candidate_firm_assignments',
        entityId: payload.assignment_id,
        beforeJson: before,
        afterJson: null,
      });

      return jsonResponse({
        success: true,
        deleted_assignment_id: payload.assignment_id,
      });
    },
    { auth: 'staff' },
  ),
);
