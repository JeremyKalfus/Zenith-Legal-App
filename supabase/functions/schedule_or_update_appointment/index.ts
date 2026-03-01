import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { assertStaff, createAuthedClient, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { syncAppointmentForParticipants } from '../_shared/calendar-sync.ts';
import { sendCandidateRecruiterChannelMessage } from '../_shared/stream-chat.ts';
import {
  queueAppointmentReminderNotifications,
  queueAppointmentStatusNotifications,
} from '../_shared/appointment-notifications.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';
import { buildAppointmentMessage } from '../_shared/appointment-message.ts';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

const schema = z.object({
  id: z.string().uuid().optional(),
  candidateUserId: z.string().uuid().optional(),
  status: z.enum(['pending', 'scheduled', 'accepted', 'declined', 'cancelled']).optional(),
  modality: z.enum(['virtual', 'in_person']),
  locationText: z.string().trim().max(255).optional(),
  videoUrl: z.string().trim().url().max(500).optional(),
  timezoneLabel: z.string().trim().min(1).max(64),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  note: z.string().trim().max(2000).optional(),
  startAtUtc: z.string().datetime().optional(),
  endAtUtc: z.string().datetime().optional(),
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  if (!value.startAtUtc && (!value.date || !value.time)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['date'],
      message: 'Provide date/time or startAtUtc.',
    });
  }
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

function normalizeStatus(status: z.infer<typeof schema>['status'] | undefined) {
  if (status === 'accepted') {
    return 'scheduled';
  }

  return status;
}

function toOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveStartAtUtc(payload: z.infer<typeof schema>): string {
  if (payload.startAtUtc) {
    return payload.startAtUtc;
  }

  const parsed = new Date(`${payload.date}T${payload.time}:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid appointment date/time');
  }

  return parsed.toISOString();
}

function resolveEndAtUtc(payload: z.infer<typeof schema>, startAtUtc: string): string {
  if (payload.endAtUtc) {
    return payload.endAtUtc;
  }

  const startMs = Date.parse(startAtUtc);
  if (!Number.isFinite(startMs)) {
    throw new Error('Invalid appointment start time');
  }

  return new Date(startMs + THIRTY_MINUTES_MS).toISOString();
}

function buildInternalTitle(candidateName: string, explicitTitle?: string): string {
  const fallback = `Appointment with ${candidateName}`;
  const normalized = explicitTitle?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

const scheduleOrUpdateAppointmentHandler = createEdgeHandler(
  async (context) => {
    const { request, authHeader, userId } = context;
    const resolvedUserId = userId as string;
    const client = createAuthedClient(authHeader);
    const serviceClient = createServiceClient();

    const parsedPayload = schema.safeParse(await request.json());
    if (!parsedPayload.success) {
      return errorResponse('Invalid appointment payload', 422, 'invalid_payload');
    }

    const payload = parsedPayload.data;
    const normalizedStatus = normalizeStatus(payload.status);
    await assertStaff(authHeader);
    const actorIsStaff = true;

    let previousAppointment: AppointmentRecord | null = null;
    if (payload.id) {
      const { data: previous, error: previousError } = await client
        .from('appointments')
        .select('*')
        .eq('id', payload.id)
        .single();

      if (previousError || !previous) {
        return errorResponse(previousError?.message ?? 'Appointment not found', 404, 'appointment_not_found');
      }

      previousAppointment = previous as AppointmentRecord;
    }

    const candidateUserId = payload.candidateUserId ?? previousAppointment?.candidate_user_id;
    if (!candidateUserId) {
      return errorResponse('Candidate is required for appointment scheduling', 422, 'invalid_payload');
    }

    const { data: candidateProfile, error: candidateError } = await serviceClient
      .from('users_profile')
      .select('id,name,role')
      .eq('id', candidateUserId)
      .maybeSingle();

    if (candidateError || !candidateProfile || candidateProfile.role !== 'candidate') {
      return errorResponse('Candidate profile not found', 404, 'candidate_not_found');
    }

    const candidateName = candidateProfile.name?.trim() || 'Candidate';

    let startAtUtc: string;
    let endAtUtc: string;
    try {
      startAtUtc = resolveStartAtUtc(payload);
      endAtUtc = resolveEndAtUtc(payload, startAtUtc);
    } catch (error) {
      return errorResponse((error as Error).message, 422, 'invalid_payload');
    }

    if (Date.parse(endAtUtc) <= Date.parse(startAtUtc)) {
      return errorResponse('End time must be after start time', 422, 'invalid_payload');
    }

    const { data: conflicts, error: conflictError } = await client
      .from('appointments')
      .select('id,start_at_utc,end_at_utc')
      .eq('candidate_user_id', candidateUserId)
      .eq('status', 'scheduled')
      .neq('id', payload.id ?? '00000000-0000-0000-0000-000000000000')
      .lt('start_at_utc', endAtUtc)
      .gt('end_at_utc', startAtUtc)
      .limit(1);

    if (conflictError) {
      return errorResponse(conflictError.message, 400);
    }

    if (conflicts && conflicts.length > 0) {
      return errorResponse('Appointment conflict detected', 409, 'appointment_conflict');
    }

    const dbPayload = {
      candidate_user_id: candidateUserId,
      created_by_user_id: resolvedUserId,
      title: buildInternalTitle(candidateName, payload.title),
      description: toOptionalString(payload.note) ?? toOptionalString(payload.description) ?? null,
      modality: payload.modality,
      location_text: payload.modality === 'in_person' ? toOptionalString(payload.locationText) ?? null : null,
      video_url: payload.modality === 'virtual' ? toOptionalString(payload.videoUrl) ?? null : null,
      start_at_utc: startAtUtc,
      end_at_utc: endAtUtc,
      timezone_label: payload.timezoneLabel,
      status: normalizedStatus ?? 'scheduled',
    };

    const appointmentResult = payload.id
      ? await client
        .from('appointments')
        .update(dbPayload)
        .eq('id', payload.id)
        .select('*')
        .single()
      : await client
        .from('appointments')
        .insert(dbPayload)
        .select('*')
        .single();

    if (appointmentResult.error || !appointmentResult.data) {
      return errorResponse(appointmentResult.error?.message ?? 'Unable to save appointment', 400);
    }

    const appointment = appointmentResult.data as AppointmentRecord;

    await client.from('appointment_participants').upsert(
      [
        {
          appointment_id: appointment.id,
          user_id: candidateUserId,
          participant_type: 'candidate',
        },
        {
          appointment_id: appointment.id,
          user_id: resolvedUserId,
          participant_type: resolvedUserId === candidateUserId ? 'candidate' : 'staff',
        },
      ],
      { onConflict: 'appointment_id,user_id' },
    );

    await syncAppointmentForParticipants({
      serviceClient,
      appointment,
      participantUserIds: [candidateUserId, resolvedUserId],
    });

    await queueAppointmentStatusNotifications({
      serviceClient,
      candidateUserId,
      appointmentId: appointment.id,
      eventType: payload.id ? 'appointment.updated' : 'appointment.created',
      status: appointment.status,
    });

    if (appointment.status === 'scheduled') {
      const reminderTargets = new Set<string>([candidateUserId]);
      if (actorIsStaff && resolvedUserId !== candidateUserId) {
        reminderTargets.add(resolvedUserId);
      }

      await queueAppointmentReminderNotifications({
        serviceClient,
        appointmentId: appointment.id,
        startAtUtc: appointment.start_at_utc,
        participantUserIds: reminderTargets,
      });
    }

    if (!payload.id && appointment.status === 'scheduled' && actorIsStaff) {
      try {
        await sendCandidateRecruiterChannelMessage({
          serviceClient,
          candidateUserId,
          actorUserId: resolvedUserId,
          text: buildAppointmentMessage('Appointment scheduled.', {
            candidateName,
            appointment,
          }),
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'appointment_channel_message_failed',
            appointment_id: appointment.id,
            candidate_user_id: candidateUserId,
            actor_user_id: resolvedUserId,
            actor_is_staff: actorIsStaff,
            message_error: error instanceof Error && error.message
              ? error.message
              : String(error),
          }),
        );
        throw new Error('Unable to post appointment update message. Please retry.');
      }
    }

    if (
      payload.id &&
      actorIsStaff &&
      previousAppointment?.status === 'scheduled' &&
      appointment.status === 'scheduled'
    ) {
      try {
        await sendCandidateRecruiterChannelMessage({
          serviceClient,
          candidateUserId,
          actorUserId: resolvedUserId,
          text: buildAppointmentMessage('Scheduled appointment modified.', {
            candidateName,
            appointment,
          }),
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'appointment_update_channel_message_failed',
            appointment_id: appointment.id,
            candidate_user_id: candidateUserId,
            actor_user_id: resolvedUserId,
            message_error: error instanceof Error && error.message
              ? error.message
              : String(error),
          }),
        );
      }
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: resolvedUserId,
      action: payload.id ? 'update_appointment' : 'create_appointment',
      entityType: 'appointments',
      entityId: appointment.id,
      beforeJson: previousAppointment as unknown as Record<string, unknown> | null,
      afterJson: appointment as unknown as Record<string, unknown>,
    });

    return jsonResponse({ success: true, appointment });
  },
  { auth: 'user' },
);

Deno.serve(scheduleOrUpdateAppointmentHandler);
