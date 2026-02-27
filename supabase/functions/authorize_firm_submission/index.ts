import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const schema = z.object({
  assignment_id: z.string().uuid(),
  decision: z.enum(['authorized', 'declined']),
});

const authorizeFirmSubmissionHandler = createEdgeHandler(
    async ({ request, authHeader, userId }) => {
      const resolvedUserId = userId as string;
      const client = createAuthedClient(authHeader);
      const serviceClient = createServiceClient();
      const payload = schema.parse(await request.json());

      const { data: assignment, error: assignmentError } = await client
        .from('candidate_firm_assignments')
        .select('id,candidate_user_id,status_enum,firm_id')
        .eq('id', payload.assignment_id)
        .single();

      if (assignmentError || !assignment || assignment.candidate_user_id !== resolvedUserId) {
        return errorResponse('Assignment not found for user', 404);
      }

      const waitingStatus = 'Waiting on your authorization to contact/submit';
      const authorizedStatus = 'Authorized, will submit soon';

      if (payload.decision === 'authorized') {
        if (assignment.status_enum !== waitingStatus) {
          return errorResponse(
            'This firm cannot be authorized in its current status.',
            400,
            'invalid_authorization_transition',
          );
        }

        const upsertResult = await serviceClient.from('candidate_authorizations').upsert(
          {
            assignment_id: payload.assignment_id,
            decision: payload.decision,
            decided_by_candidate: resolvedUserId,
            decided_at: new Date().toISOString(),
          },
          { onConflict: 'assignment_id' },
        );
        if (upsertResult.error) {
          return errorResponse(upsertResult.error.message, 400);
        }

        const { data: updatedAssignment, error: updateAssignmentError } = await serviceClient
          .from('candidate_firm_assignments')
          .update({
            status_enum: authorizedStatus,
            status_updated_at: new Date().toISOString(),
          })
          .eq('id', payload.assignment_id)
          .select('*')
          .single();

        if (updateAssignmentError || !updatedAssignment) {
          return errorResponse(updateAssignmentError?.message ?? 'Unable to update assignment', 400);
        }

        await writeAuditEvent({
          client: serviceClient,
          actorUserId: resolvedUserId,
          action: 'candidate_authorization_decision',
          entityType: 'candidate_authorizations',
          entityId: payload.assignment_id,
          afterJson: {
            decision: payload.decision,
            previous_status: assignment.status_enum,
            new_status: authorizedStatus,
            action: 'assignment_updated',
          },
        });

        return jsonResponse({
          success: true,
          action: 'assignment_updated',
          previous_status: assignment.status_enum,
          new_status: authorizedStatus,
          assignment: updatedAssignment,
        });
      }

      if (assignment.status_enum !== waitingStatus && assignment.status_enum !== authorizedStatus) {
        return errorResponse(
          'This firm cannot be declined in its current status.',
          400,
          'invalid_authorization_transition',
        );
      }

      if (assignment.status_enum === waitingStatus) {
        const { error: deleteAssignmentError } = await serviceClient
          .from('candidate_firm_assignments')
          .delete()
          .eq('id', payload.assignment_id);

        if (deleteAssignmentError) {
          return errorResponse(deleteAssignmentError.message, 400);
        }

        await writeAuditEvent({
          client: serviceClient,
          actorUserId: resolvedUserId,
          action: 'candidate_declined_firm_assignment',
          entityType: 'candidate_firm_assignments',
          entityId: payload.assignment_id,
          beforeJson: assignment as unknown as Record<string, unknown>,
          afterJson: {
            decision: payload.decision,
            action: 'assignment_deleted',
          },
        });

        return jsonResponse({
          success: true,
          action: 'assignment_deleted',
          previous_status: assignment.status_enum,
          new_status: null,
          assignment: null,
        });
      }

      const upsertResult = await serviceClient.from('candidate_authorizations').upsert(
        {
          assignment_id: payload.assignment_id,
          decision: payload.decision,
          decided_by_candidate: resolvedUserId,
          decided_at: new Date().toISOString(),
        },
        { onConflict: 'assignment_id' },
      );
      if (upsertResult.error) {
        return errorResponse(upsertResult.error.message, 400);
      }

      const { data: updatedAssignment, error: updateAssignmentError } = await serviceClient
        .from('candidate_firm_assignments')
        .update({
          status_enum: waitingStatus,
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', payload.assignment_id)
        .select('*')
        .single();

      if (updateAssignmentError || !updatedAssignment) {
        return errorResponse(updateAssignmentError?.message ?? 'Unable to update assignment', 400);
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId: resolvedUserId,
        action: 'candidate_authorization_decision',
        entityType: 'candidate_authorizations',
        entityId: payload.assignment_id,
        afterJson: {
          decision: payload.decision,
          previous_status: assignment.status_enum,
          new_status: waitingStatus,
          action: 'assignment_updated',
        },
      });

      return jsonResponse({
        success: true,
        action: 'assignment_updated',
        previous_status: assignment.status_enum,
        new_status: waitingStatus,
        assignment: updatedAssignment,
      });
    },
    { auth: 'user' },
);

Deno.serve(authorizeFirmSubmissionHandler);
