import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { assertStaff, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { syncAppointmentForParticipants } from '../_shared/calendar-sync.ts';

const schema = z.object({
  appointment_id: z.string().uuid(),
  decision: z.enum(['accepted', 'declined']),
});

function buildReminderSendAfter(startAtUtc: string): string | null {
  const reminderAtMs = Date.parse(startAtUtc) - 15 * 60 * 1000;
  if (!Number.isFinite(reminderAtMs)) {
    return null;
  }

  return reminderAtMs > Date.now() ? new Date(reminderAtMs).toISOString() : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const actorUserId = await assertStaff(authHeader);
    const serviceClient = createServiceClient();
    const payload = schema.parse(await request.json());

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

    await serviceClient.from('notification_deliveries').insert([
      {
        user_id: appointment.candidate_user_id,
        channel: 'push',
        event_type: 'appointment.updated',
        payload: {
          appointment_id: appointment.id,
          decision: nextStatus,
          status: nextStatus,
        },
        status: 'queued',
      },
      {
        user_id: appointment.candidate_user_id,
        channel: 'email',
        event_type: 'appointment.updated',
        payload: {
          appointment_id: appointment.id,
          decision: nextStatus,
          status: nextStatus,
        },
        status: 'queued',
      },
    ]);

    const reminderSendAfter = nextStatus === 'scheduled' ? buildReminderSendAfter(appointment.start_at_utc) : null;
    if (reminderSendAfter) {
      const reminderTargets = new Set<string>([appointment.candidate_user_id]);
      reminderTargets.add(actorUserId);
      await serviceClient.from('notification_deliveries').insert(
        Array.from(reminderTargets).map((targetUserId) => ({
          user_id: targetUserId,
          channel: 'push',
          event_type: 'appointment.reminder',
          payload: {
            appointment_id: appointment.id,
            start_at_utc: appointment.start_at_utc,
          },
          send_after_utc: reminderSendAfter,
          status: 'queued',
        })),
      );
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
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Forbidden: staff access required') {
      return errorResponse(message, 403);
    }
    if (message.startsWith('Unauthorized')) {
      return errorResponse(message, 401);
    }
    return errorResponse(message, 500);
  }
});
