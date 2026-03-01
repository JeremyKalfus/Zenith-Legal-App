import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { syncAppointmentForParticipants } from '../_shared/calendar-sync.ts';
import { sendCandidateRecruiterChannelMessage } from '../_shared/stream-chat.ts';
import {
  queueAppointmentReminderNotifications,
  queueAppointmentStatusNotifications,
} from '../_shared/appointment-notifications.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';
import { buildAppointmentMessage } from '../_shared/appointment-message.ts';

const appointmentReviewSchema = z.object({
  appointment_id: z.string().uuid(),
  decision: z.enum(['accepted', 'declined']),
});

type AppointmentRecord = {
  id: string;
  title: string;
  description: string | null;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  start_at_utc: string;
  end_at_utc: string;
  timezone_label: string;
  status: string;
  candidate_user_id: string;
};

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

    const { data: candidateProfile } = await serviceClient
      .from('users_profile')
      .select('name')
      .eq('id', appointment.candidate_user_id)
      .maybeSingle();
    const candidateName = candidateProfile?.name?.trim() || 'Candidate';

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

    if (payload.decision === 'declined') {
      const appointmentRecord = appointment as AppointmentRecord;
      try {
        await sendCandidateRecruiterChannelMessage({
          serviceClient,
          candidateUserId: appointment.candidate_user_id,
          actorUserId,
          text: buildAppointmentMessage('Appointment request declined.', {
            candidateName,
            appointment: appointmentRecord,
          }),
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'appointment_decline_channel_message_failed',
            appointment_id: appointment.id,
            candidate_user_id: appointment.candidate_user_id,
            actor_user_id: actorUserId,
            message_error: error instanceof Error && error.message
              ? error.message
              : String(error),
          }),
        );
      }

      await queueAppointmentStatusNotifications({
        serviceClient,
        candidateUserId: appointment.candidate_user_id,
        appointmentId: appointment.id,
        eventType: 'appointment.updated',
        status: 'declined',
      });

      const { error: deleteError } = await serviceClient
        .from('appointments')
        .delete()
        .eq('id', payload.appointment_id);

      if (deleteError) {
        return errorResponse(deleteError.message, 400, 'status_update_failed');
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'staff_decline_appointment_request',
        entityType: 'appointments',
        entityId: payload.appointment_id,
        beforeJson: appointment as Record<string, unknown>,
      });

      return jsonResponse({
        success: true,
        appointment: null,
        previous_status: appointment.status,
        new_status: 'deleted',
      });
    }

    const { data: updated, error: updateError } = await serviceClient
      .from('appointments')
      .update({ status: 'scheduled' })
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

    await serviceClient.from('appointment_participants').upsert(
      {
        appointment_id: appointment.id,
        user_id: actorUserId,
        participant_type: 'staff',
      },
      { onConflict: 'appointment_id,user_id' },
    );

    await queueAppointmentStatusNotifications({
      serviceClient,
      candidateUserId: appointment.candidate_user_id,
      appointmentId: appointment.id,
      eventType: 'appointment.updated',
      status: 'scheduled',
    });

    await queueAppointmentReminderNotifications({
      serviceClient,
      appointmentId: appointment.id,
      startAtUtc: appointment.start_at_utc,
      participantUserIds: [appointment.candidate_user_id, actorUserId],
    });

    await syncAppointmentForParticipants({
      serviceClient,
      appointment: updated,
      participantUserIds: [appointment.candidate_user_id, actorUserId],
    });

    try {
      await sendCandidateRecruiterChannelMessage({
        serviceClient,
        candidateUserId: appointment.candidate_user_id,
        actorUserId,
        text: buildAppointmentMessage('Appointment request accepted and scheduled.', {
          candidateName,
          appointment: updated as AppointmentRecord,
        }),
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'appointment_review_channel_message_failed',
          appointment_id: appointment.id,
          candidate_user_id: appointment.candidate_user_id,
          actor_user_id: actorUserId,
          message_error: error instanceof Error && error.message
            ? error.message
            : String(error),
        }),
      );
    }

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
      new_status: 'scheduled',
    });
  },
  { auth: 'staff' },
);

Deno.serve(staffReviewAppointmentHandler);
