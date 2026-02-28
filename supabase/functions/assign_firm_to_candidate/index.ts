import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';
import { sendCandidateRecruiterChannelMessage } from '../_shared/stream-chat.ts';

const schema = z.object({
  candidate_id: z.string().uuid(),
  firm_id: z.string().uuid(),
});


Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const actorUserId = userId as string;
      const serviceClient = createServiceClient();
      const payload = schema.parse(await request.json());

      const [{ data: candidate, error: candidateError }, { data: firm, error: firmError }] =
        await Promise.all([
          serviceClient
            .from('users_profile')
            .select('id,role')
            .eq('id', payload.candidate_id)
            .maybeSingle(),
          serviceClient
            .from('firms')
            .select('id,name,active')
            .eq('id', payload.firm_id)
            .maybeSingle(),
        ]);

      if (candidateError) {
        return errorResponse(candidateError.message, 400, 'candidate_lookup_failed');
      }
      if (!candidate || candidate.role !== 'candidate') {
        return errorResponse('Candidate not found', 404, 'candidate_not_found');
      }

      if (firmError) {
        return errorResponse(firmError.message, 400, 'firm_lookup_failed');
      }
      if (!firm) {
        return errorResponse('Firm not found', 404, 'firm_not_found');
      }
      if (!firm.active) {
        return errorResponse('Firm is inactive and cannot be assigned', 400, 'firm_inactive');
      }

      const { data, error } = await serviceClient
        .from('candidate_firm_assignments')
        .insert({
          candidate_user_id: payload.candidate_id,
          firm_id: payload.firm_id,
          status_enum: 'Waiting on your authorization to contact/submit',
          assigned_by: actorUserId,
        })
        .select('*')
        .single();

      if (error || !data) {
        const errorCode =
          (error as { code?: string } | null)?.code === '23505'
            ? 'duplicate_assignment'
            : 'assign_failed';
        const message =
          errorCode === 'duplicate_assignment'
            ? 'This firm is already assigned to this candidate.'
            : error?.message ?? 'Unable to assign firm';
        return errorResponse(message, errorCode === 'duplicate_assignment' ? 409 : 400, errorCode);
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'assign_firm_to_candidate',
        entityType: 'candidate_firm_assignments',
        entityId: data.id,
        afterJson: data,
      });

      await sendCandidateRecruiterChannelMessage({
        serviceClient,
        candidateUserId: payload.candidate_id,
        actorUserId,
        text:
          `Firm assignment created: ${firm.name}. ` +
          'Current status is "Waiting on your authorization to contact/submit".',
      });

      return jsonResponse({
        success: true,
        assignment: data,
        candidate: { id: payload.candidate_id },
        firm: { id: firm.id, name: firm.name },
      });
    },
    { auth: 'staff' },
  ),
);
