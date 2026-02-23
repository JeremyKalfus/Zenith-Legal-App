import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { assertStaff, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const appointmentSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
    modality: z.enum(['virtual', 'in_person']),
    locationText: z.string().trim().max(255).optional(),
    videoUrl: z.string().trim().url().max(500).optional(),
    startAtUtc: z.string().datetime(),
    endAtUtc: z.string().datetime(),
    timezoneLabel: z.string().trim().min(1).max(64),
  })
  .superRefine((value, ctx) => {
    if (Date.parse(value.endAtUtc) <= Date.parse(value.startAtUtc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endAtUtc must be after startAtUtc',
        path: ['endAtUtc'],
      });
    }

    if (value.modality === 'virtual' && !value.videoUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'videoUrl required for virtual appointments',
        path: ['videoUrl'],
      });
    }

    if (value.modality === 'in_person' && !value.locationText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'locationText required for in-person appointments',
        path: ['locationText'],
      });
    }
  });

const schema = appointmentSchema.extend({
  id: z.string().uuid(),
  status: z.enum(['accepted', 'declined', 'cancelled']).optional(),
});

type AppointmentStatus = 'requested' | 'accepted' | 'declined' | 'cancelled';

type AppointmentRow = {
  id: string;
  candidate_user_id: string;
  created_by_user_id: string;
  title: string;
  description: string | null;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  start_at_utc: string;
  end_at_utc: string;
  timezone_label: string;
  status: AppointmentStatus;
};

function toError(error: Error): Response {
  if (error.message === 'Unauthorized') {
    return errorResponse('Unauthorized', 401);
  }
  if (error.message.startsWith('Forbidden')) {
    return errorResponse(error.message, 403);
  }
  return errorResponse(error.message, 500);
}

async function findAcceptedConflict(params: {
  serviceClient: ReturnType<typeof createServiceClient>;
  candidateUserId: string;
  appointmentId: string;
  startAtUtc: string;
  endAtUtc: string;
}) {
  const { data, error } = await params.serviceClient
    .from('appointments')
    .select('id')
    .eq('candidate_user_id', params.candidateUserId)
    .eq('status', 'accepted')
    .neq('id', params.appointmentId)
    .lt('start_at_utc', params.endAtUtc)
    .gt('end_at_utc', params.startAtUtc)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data?.length ?? 0) > 0;
}

function participantRows(appointmentId: string, candidateUserId: string, staffUserId: string) {
  const rows = [
    {
      appointment_id: appointmentId,
      user_id: candidateUserId,
      participant_type: 'candidate',
    },
    {
      appointment_id: appointmentId,
      user_id: staffUserId,
      participant_type: 'staff',
    },
  ];

  if (candidateUserId === staffUserId) {
    return rows.slice(0, 1);
  }

  return rows;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const staffUserId = await assertStaff(authHeader);
    const serviceClient = createServiceClient();
    const payload = schema.parse(await request.json());

    const { data: existingData, error: existingError } = await serviceClient
      .from('appointments')
      .select('*')
      .eq('id', payload.id)
      .single();

    if (existingError || !existingData) {
      return errorResponse(existingError?.message ?? 'Appointment not found', 404);
    }

    const beforeAppointment = existingData as AppointmentRow;
    const nextStatus = (payload.status ?? beforeAppointment.status) as AppointmentStatus;

    if (nextStatus === 'accepted') {
      const hasConflict = await findAcceptedConflict({
        serviceClient,
        candidateUserId: beforeAppointment.candidate_user_id,
        appointmentId: beforeAppointment.id,
        startAtUtc: payload.startAtUtc,
        endAtUtc: payload.endAtUtc,
      });

      if (hasConflict) {
        return errorResponse('Appointment conflict detected', 409);
      }
    }

    const dbPayload = {
      title: payload.title,
      description: payload.description ?? null,
      modality: payload.modality,
      location_text: payload.locationText ?? null,
      video_url: payload.videoUrl ?? null,
      start_at_utc: payload.startAtUtc,
      end_at_utc: payload.endAtUtc,
      timezone_label: payload.timezoneLabel,
      status: nextStatus,
    };

    const updateResult = await serviceClient
      .from('appointments')
      .update(dbPayload)
      .eq('id', payload.id)
      .select('*')
      .single();

    if (updateResult.error || !updateResult.data) {
      const message = updateResult.error?.message ?? 'Unable to update appointment';
      const status = message.toLowerCase().includes('overlap') ? 409 : 400;
      return errorResponse(message, status);
    }

    const appointment = updateResult.data as AppointmentRow;

    await serviceClient
      .from('appointment_participants')
      .upsert(
        participantRows(appointment.id, appointment.candidate_user_id, staffUserId),
        { onConflict: 'appointment_id,user_id' },
      );

    const eventType = appointment.status === 'cancelled' ? 'appointment.cancelled' : 'appointment.updated';

    await serviceClient.from('notification_deliveries').insert([
      {
        user_id: appointment.candidate_user_id,
        channel: 'push',
        event_type: eventType,
        payload: { appointment_id: appointment.id, status: appointment.status },
        status: 'queued',
      },
      {
        user_id: appointment.candidate_user_id,
        channel: 'email',
        event_type: eventType,
        payload: { appointment_id: appointment.id, status: appointment.status },
        status: 'queued',
      },
    ]);

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: staffUserId,
      action:
        statusOverride === 'accepted'
          ? 'accept_appointment'
          : statusOverride === 'declined'
            ? 'decline_appointment'
            : statusOverride === 'cancelled'
              ? 'cancel_appointment'
              : 'update_appointment',
      entityType: 'appointments',
      entityId: appointment.id,
      beforeJson: beforeAppointment as unknown as Record<string, unknown>,
      afterJson: appointment as unknown as Record<string, unknown>,
    });

    return jsonResponse({ success: true, appointment });
  } catch (error) {
    return toError(error as Error);
  }
});
