import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const FIRM_STATUSES = [
  'Waiting on your authorization to contact/submit',
  'Submitted, waiting to hear from firm',
  'Interview Stage',
  'Rejected by firm',
  'Offer received!',
] as const;

const schema = z.object({
  assignment_id: z.string().uuid(),
  new_status: z.enum(FIRM_STATUSES),
});


Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const actorUserId = userId as string;
      const serviceClient = createServiceClient();
      const parsed = schema.safeParse(await request.json());

      if (!parsed.success) {
        return errorResponse('Invalid status update payload', 422, 'invalid_payload');
      }
      const payload = parsed.data;

      const { data: before, error: beforeError } = await serviceClient
        .from('candidate_firm_assignments')
        .select('*')
        .eq('id', payload.assignment_id)
        .single();

      if (beforeError || !before) {
        return errorResponse('Assignment not found', 404, 'assignment_not_found');
      }

      if (before.status_enum === payload.new_status) {
        return jsonResponse({
          success: true,
          unchanged: true,
          assignment: before,
          previous_status: before.status_enum,
          new_status: payload.new_status,
        });
      }

      const { data: updated, error: updateError } = await serviceClient
        .from('candidate_firm_assignments')
        .update({
          status_enum: payload.new_status,
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', payload.assignment_id)
        .select('*')
        .single();

      if (updateError || !updated) {
        return errorResponse(
          updateError?.message ?? 'Unable to update assignment',
          400,
          'status_update_failed',
        );
      }

      await serviceClient.from('notification_deliveries').insert({
        user_id: updated.candidate_user_id,
        channel: 'push',
        event_type: 'firm_status.updated',
        payload: {
          assignment_id: updated.id,
          status: payload.new_status,
        },
        status: 'queued',
      });

      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'staff_update_assignment_status',
        entityType: 'candidate_firm_assignments',
        entityId: payload.assignment_id,
        beforeJson: before,
        afterJson: updated,
      });

      return jsonResponse({
        success: true,
        unchanged: false,
        assignment: updated,
        previous_status: before.status_enum,
        new_status: payload.new_status,
      });
    },
    { auth: 'staff' },
  ),
);
