import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { syncAppointmentForParticipants } from '../_shared/calendar-sync.ts';
import {
  queueAppointmentReminderNotifications,
  queueAppointmentStatusNotifications,
} from '../_shared/appointment-notifications.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const appointmentReviewSchema = z.object({
  appointment_id: z.string().uuid(),
  decision: z.enum(['accepted', 'declined']),
});

const staffReviewAppointmentHandler = createEdgeHandler(
  async ({ request, userId }) => {
    const actorUserId = userId as string;
    const serviceClient = createServiceClient();
    const parsedBody = appointmentReviewSchema.safeParse(await request.json());

    if (!parsedBody.success) {
      return errorResponse('Invalid appointment review payload', 422, 'invalid_payload');
    }
    const payload = parsedBody.data;

    const { data: appointment, error: fetchError } = await serviceClient
      .from('appointments')
      .select('*')
      .eq('id', payload.appointment_id)
      .single();

    if (fetchError || !appointment) {
      return errorResponse('Appointment not found', 404, 'appointment_not_found');
    }

    if (appointment.status !== 'pending') {
      return errorResponse(
        `Cannot review appointment with status "${appointment.status}"`,
        422,
        'invalid_status_transition',
      );
    }

    if (payload.decision === 'accepted') {
      const { data: conflicts, error: conflictError } = await serviceClient
        .from('appointments')
        .select('id,start_at_utc,end_at_utc')
        .eq('candidate_user_id', appointment.candidate_user_id)
        .eq('status', 'scheduled')
        .neq('id', appointment.id)
        .lt('start_at_utc', appointment.end_at_utc)
        .gt('end_at_utc', appointment.start_at_utc)
        .limit(1);

      if (conflictError) {
        return errorResponse(conflictError.message, 400);
      }

      if (conflicts && conflicts.length > 0) {
        return errorResponse(
          'Scheduling this appointment would create a scheduling conflict',
          409,
          'appointment_conflict',
        );
      }
    }

    const nextStatus = payload.decision === 'accepted' ? 'scheduled' : 'declined';
    const { data: updated, error: updateError } = await serviceClient
      .from('appointments')
      .update({ status: nextStatus })
      .eq('id', payload.appointment_id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return errorResponse(
        updateError?.message ?? 'Unable to update appointment',
        400,
        'status_update_failed',
      );
    }

    if (nextStatus === 'scheduled') {
      await serviceClient.from('appointment_participants').upsert(
        {
          appointment_id: appointment.id,
          user_id: actorUserId,
          participant_type: 'staff',
        },
        { onConflict: 'appointment_id,user_id' },
      );
    }

    await queueAppointmentStatusNotifications({
      serviceClient,
      candidateUserId: appointment.candidate_user_id,
      appointmentId: appointment.id,
      eventType: 'appointment.updated',
      status: nextStatus,
    });

    if (nextStatus === 'scheduled') {
      await queueAppointmentReminderNotifications({
        serviceClient,
        appointmentId: appointment.id,
        startAtUtc: appointment.start_at_utc,
        participantUserIds: [appointment.candidate_user_id, actorUserId],
      });
    }

    await syncAppointmentForParticipants({
      serviceClient,
      appointment: updated,
      participantUserIds: [appointment.candidate_user_id, actorUserId],
    });

    await writeAuditEvent({
      client: serviceClient,
      actorUserId,
      action: 'staff_review_appointment',
      entityType: 'appointments',
      entityId: payload.appointment_id,
      beforeJson: appointment as Record<string, unknown>,
      afterJson: updated as Record<string, unknown>,
    });

    return jsonResponse({
      success: true,
      appointment: updated,
      previous_status: appointment.status,
      new_status: nextStatus,
    });
  },
  { auth: 'staff' },
);

Deno.serve(staffReviewAppointmentHandler);
