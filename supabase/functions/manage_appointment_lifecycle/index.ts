import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { sendCandidateRecruiterChannelMessage } from '../_shared/stream-chat.ts';
import {
  queueAppointmentCancelledNotifications,
} from '../_shared/appointment-notifications.ts';
import { syncAppointmentForParticipants } from '../_shared/calendar-sync.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';
import { buildAppointmentMessage } from '../_shared/appointment-message.ts';

const lifecycleSchema = z.object({
  appointment_id: z.string().uuid(),
  action: z.enum(['ignore_overdue', 'cancel_outgoing_request', 'cancel_upcoming']),
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
  created_by_user_id: string;
};

function parseAppointmentStartMs(appointment: AppointmentRecord): number | null {
  const startTimeMs = Date.parse(appointment.start_at_utc);
  if (!Number.isFinite(startTimeMs)) {
    return null;
  }

  return startTimeMs;
}

async function getParticipantUserIds(params: {
  serviceClient: ReturnType<typeof createServiceClient>;
  appointmentId: string;
  candidateUserId: string;
}) {
  const { serviceClient, appointmentId, candidateUserId } = params;
  const { data: participantRows, error: participantError } = await serviceClient
    .from('appointment_participants')
    .select('user_id')
    .eq('appointment_id', appointmentId);

  if (participantError) {
    throw new Error(participantError.message);
  }

  return Array.from(
    new Set([
      candidateUserId,
      ...(participantRows ?? []).map((participant) => participant.user_id as string),
    ]),
  );
}

const manageAppointmentLifecycleHandler = createEdgeHandler(
  async ({ request, userId }) => {
    const actorUserId = userId as string;
    const serviceClient = createServiceClient();

    let payloadRaw: unknown;
    try {
      payloadRaw = await request.json();
    } catch {
      return errorResponse('Invalid appointment lifecycle payload', 422, 'invalid_payload');
    }

    const parsed = lifecycleSchema.safeParse(payloadRaw);
    if (!parsed.success) {
      return errorResponse('Invalid appointment lifecycle payload', 422, 'invalid_payload');
    }
    const payload = parsed.data;

    const [{ data: actorProfile, error: actorError }, { data: appointment, error: appointmentError }] =
      await Promise.all([
        serviceClient
          .from('users_profile')
          .select('id,name,role')
          .eq('id', actorUserId)
          .maybeSingle(),
        serviceClient
          .from('appointments')
          .select('*')
          .eq('id', payload.appointment_id)
          .maybeSingle(),
      ]);

    if (actorError || !actorProfile) {
      return errorResponse('Forbidden action', 403, 'forbidden_action');
    }

    if (appointmentError || !appointment) {
      return errorResponse('Appointment not found', 404, 'appointment_not_found');
    }

    const actorIsStaff = actorProfile.role === 'staff';
    if (!actorIsStaff && appointment.candidate_user_id !== actorUserId) {
      return errorResponse('Forbidden action', 403, 'forbidden_action');
    }

    const currentAppointment = appointment as AppointmentRecord;
    const appointmentStartMs = parseAppointmentStartMs(currentAppointment);
    const nowMs = Date.now();
    const isOverdueScheduled =
      currentAppointment.status === 'scheduled' &&
      appointmentStartMs !== null &&
      appointmentStartMs < nowMs;
    const isUpcomingScheduled =
      currentAppointment.status === 'scheduled' &&
      (appointmentStartMs === null || appointmentStartMs >= nowMs);
    const isCandidateCreatedPending =
      currentAppointment.status === 'pending' &&
      currentAppointment.created_by_user_id === currentAppointment.candidate_user_id;

    if (payload.action === 'ignore_overdue') {
      if (!isOverdueScheduled) {
        return errorResponse('This appointment cannot be ignored in its current state.', 422, 'invalid_status_transition');
      }

      try {
        const participantUserIds = await getParticipantUserIds({
          serviceClient,
          appointmentId: currentAppointment.id,
          candidateUserId: currentAppointment.candidate_user_id,
        });

        await syncAppointmentForParticipants({
          serviceClient,
          appointment: {
            ...currentAppointment,
            status: 'cancelled',
          },
          participantUserIds,
        });
      } catch (error) {
        return errorResponse((error as Error).message, 400, 'status_update_failed');
      }

      const { error: deleteError } = await serviceClient
        .from('appointments')
        .delete()
        .eq('id', currentAppointment.id);

      if (deleteError) {
        return errorResponse(deleteError.message, 400, 'status_update_failed');
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'ignore_overdue_appointment',
        entityType: 'appointments',
        entityId: currentAppointment.id,
        beforeJson: currentAppointment as unknown as Record<string, unknown>,
      });

      return jsonResponse({
        success: true,
        action: payload.action,
        result: 'deleted',
        appointment_id: currentAppointment.id,
      });
    }

    if (payload.action === 'cancel_outgoing_request') {
      if (!isCandidateCreatedPending) {
        return errorResponse('This request cannot be canceled in its current state.', 422, 'invalid_status_transition');
      }
      if (!actorIsStaff && currentAppointment.created_by_user_id !== actorUserId) {
        return errorResponse('Forbidden action', 403, 'forbidden_action');
      }

      const { error: deleteError } = await serviceClient
        .from('appointments')
        .delete()
        .eq('id', currentAppointment.id);

      if (deleteError) {
        return errorResponse(deleteError.message, 400, 'status_update_failed');
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'cancel_outgoing_appointment_request',
        entityType: 'appointments',
        entityId: currentAppointment.id,
        beforeJson: currentAppointment as unknown as Record<string, unknown>,
      });

      return jsonResponse({
        success: true,
        action: payload.action,
        result: 'deleted',
        appointment_id: currentAppointment.id,
      });
    }

    if (!isUpcomingScheduled) {
      return errorResponse('This appointment cannot be canceled in its current state.', 422, 'invalid_status_transition');
    }

    const { data: candidateProfile } = await serviceClient
      .from('users_profile')
      .select('name')
      .eq('id', currentAppointment.candidate_user_id)
      .maybeSingle();
    const candidateName = candidateProfile?.name?.trim() || 'Candidate';

    let participantUserIds: string[] = [];
    try {
      participantUserIds = await getParticipantUserIds({
        serviceClient,
        appointmentId: currentAppointment.id,
        candidateUserId: currentAppointment.candidate_user_id,
      });

      await syncAppointmentForParticipants({
        serviceClient,
        appointment: {
          ...currentAppointment,
          status: 'cancelled',
        },
        participantUserIds,
      });
    } catch (error) {
      return errorResponse((error as Error).message, 400, 'status_update_failed');
    }

    try {
      await sendCandidateRecruiterChannelMessage({
        serviceClient,
        candidateUserId: currentAppointment.candidate_user_id,
        actorUserId,
        text: buildAppointmentMessage('Scheduled appointment canceled.', {
          candidateName,
          appointment: currentAppointment,
        }),
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'appointment_cancel_channel_message_failed',
          appointment_id: currentAppointment.id,
          candidate_user_id: currentAppointment.candidate_user_id,
          actor_user_id: actorUserId,
          message_error:
            error instanceof Error && error.message
              ? error.message
              : String(error),
        }),
      );
    }

    let notificationRecipients: string[] = [];
    if (actorIsStaff) {
      notificationRecipients = [currentAppointment.candidate_user_id];
    } else {
      const { data: staffRows } = await serviceClient
        .from('users_profile')
        .select('id')
        .eq('role', 'staff');
      notificationRecipients = (staffRows ?? [])
        .map((row) => row.id as string)
        .filter((id) => id !== actorUserId);
    }

    await queueAppointmentCancelledNotifications({
      serviceClient,
      appointmentId: currentAppointment.id,
      recipientUserIds: notificationRecipients,
    });

    const { error: deleteError } = await serviceClient
      .from('appointments')
      .delete()
      .eq('id', currentAppointment.id);

    if (deleteError) {
      return errorResponse(deleteError.message, 400, 'status_update_failed');
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId,
      action: 'cancel_upcoming_appointment',
      entityType: 'appointments',
      entityId: currentAppointment.id,
      beforeJson: currentAppointment as unknown as Record<string, unknown>,
    });

    return jsonResponse({
      success: true,
      action: payload.action,
      result: 'deleted',
      appointment_id: currentAppointment.id,
    });
  },
  { auth: 'user' },
);

Deno.serve(manageAppointmentLifecycleHandler);
