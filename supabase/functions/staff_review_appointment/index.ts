import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { assertStaff, createAuthedClient, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const schema = z.object({
  appointmentId: z.string().uuid(),
  decision: z.enum(['accepted', 'declined']),
});

type AppointmentStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

type AppointmentRow = {
  id: string;
  candidate_user_id: string;
  status: AppointmentStatus;
  start_at_utc: string;
  end_at_utc: string;
  [key: string]: unknown;
};

function isAcceptedOverlapConstraintError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return message.includes('appointments_no_overlapping_accepted_per_candidate');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const staffUserId = await assertStaff(authHeader);
    const client = createAuthedClient(authHeader);
    const serviceClient = createServiceClient();
    const payload = schema.parse(await request.json());

    const { data: appointmentData, error: appointmentError } = await client
      .from('appointments')
      .select('*')
      .eq('id', payload.appointmentId)
      .single();

    if (appointmentError || !appointmentData) {
      return errorResponse(appointmentError?.message ?? 'Appointment not found', 404);
    }

    const appointment = appointmentData as AppointmentRow;

    if (appointment.status === 'cancelled') {
      return errorResponse('Cancelled appointments cannot be reviewed', 400);
    }

    if (appointment.status === payload.decision) {
      return jsonResponse({ success: true, appointment });
    }

    if (payload.decision === 'accepted') {
      const { data: conflicts, error: conflictError } = await client
        .from('appointments')
        .select('id')
        .eq('candidate_user_id', appointment.candidate_user_id)
        .eq('status', 'accepted')
        .neq('id', appointment.id)
        .lt('start_at_utc', appointment.end_at_utc)
        .gt('end_at_utc', appointment.start_at_utc)
        .limit(1);

      if (conflictError) {
        return errorResponse(conflictError.message, 400);
      }

      if (conflicts && conflicts.length > 0) {
        return errorResponse(
          'Cannot accept this appointment because the candidate already has an accepted appointment in this time window.',
          409,
        );
      }
    }

    const { data: updatedData, error: updateError } = await client
      .from('appointments')
      .update({ status: payload.decision })
      .eq('id', appointment.id)
      .select('*')
      .single();

    if (updateError || !updatedData) {
      if (isAcceptedOverlapConstraintError(updateError?.message)) {
        return errorResponse(
          'Cannot accept this appointment because the candidate already has an accepted appointment in this time window.',
          409,
        );
      }
      return errorResponse(updateError?.message ?? 'Unable to review appointment', 400);
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: staffUserId,
      action: payload.decision === 'accepted' ? 'accept_appointment' : 'decline_appointment',
      entityType: 'appointments',
      entityId: appointment.id,
      beforeJson: appointment,
      afterJson: updatedData as Record<string, unknown>,
    });

    return jsonResponse({ success: true, appointment: updatedData });
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Forbidden: staff access required') {
      return errorResponse(message, 403);
    }
    if (message === 'Unauthorized') {
      return errorResponse(message, 401);
    }
    return errorResponse(message, 500);
  }
});
