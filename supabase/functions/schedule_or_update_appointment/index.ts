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
  });

const schema = appointmentSchema.extend({
  id: z.string().uuid().optional(),
  candidateUserId: z.string().uuid().optional(),
  status: z.enum(['pending', 'scheduled', 'accepted', 'declined', 'cancelled']).optional(),
});

function normalizeStatus(status: z.infer<typeof schema>['status'] | undefined) {
  if (status === 'accepted') {
    return 'scheduled';
  }

  return status;
}

function formatAppointmentTimestampForMessage(appointment: {
  start_at_utc: string;
  timezone_label: string;
}) {
  const startAt = new Date(appointment.start_at_utc);
  if (Number.isNaN(startAt.getTime())) {
    return appointment.start_at_utc;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: appointment.timezone_label,
    }).format(startAt);
  } catch {
    return startAt.toISOString();
  }
}

function getAppointmentStatusLabel(status: string) {
  if (status === 'scheduled' || status === 'accepted') {
    return 'Scheduled';
  }
  if (status === 'declined') {
    return 'Declined';
  }
  if (status === 'cancelled') {
    return 'Cancelled';
  }
  return 'Pending review';
}

const scheduleOrUpdateAppointmentHandler = createEdgeHandler(
    async (context) => {
      const { request, authHeader, userId } = context;
      const resolvedUserId = userId as string;
      const client = createAuthedClient(authHeader);
      const serviceClient = createServiceClient();
      const payload = schema.parse(await request.json());
      const normalizedStatus = normalizeStatus(payload.status);

    const candidateUserId = payload.candidateUserId ?? resolvedUserId;
    const isOnBehalfScheduling = candidateUserId !== resolvedUserId;
    let actorIsStaff = false;

    if (isOnBehalfScheduling || (normalizedStatus && normalizedStatus !== 'pending')) {
      await assertStaff(authHeader);
      actorIsStaff = true;
    }

    const { data: conflicts, error: conflictError } = await client
      .from('appointments')
      .select('id,start_at_utc,end_at_utc')
      .eq('candidate_user_id', candidateUserId)
      .eq('status', 'scheduled')
      .neq('id', payload.id ?? '00000000-0000-0000-0000-000000000000')
      .lt('start_at_utc', payload.endAtUtc)
      .gt('end_at_utc', payload.startAtUtc)
      .limit(1);

    if (conflictError) {
      return errorResponse(conflictError.message, 400);
    }

    if (conflicts && conflicts.length > 0) {
      return errorResponse('Appointment conflict detected', 409);
    }

    const dbPayload = {
      candidate_user_id: candidateUserId,
      created_by_user_id: resolvedUserId,
      title: payload.title,
      description: payload.description ?? null,
      modality: payload.modality,
      location_text: payload.locationText ?? null,
      video_url: payload.videoUrl ?? null,
      start_at_utc: payload.startAtUtc,
      end_at_utc: payload.endAtUtc,
      timezone_label: payload.timezoneLabel,
      status: normalizedStatus ?? 'pending',
    };

    let appointmentResult;

    if (payload.id) {
      appointmentResult = await client
        .from('appointments')
        .update(dbPayload)
        .eq('id', payload.id)
        .select('*')
        .single();
    } else {
      appointmentResult = await client
        .from('appointments')
        .insert(dbPayload)
        .select('*')
        .single();
    }

    if (appointmentResult.error || !appointmentResult.data) {
      return errorResponse(appointmentResult.error?.message ?? 'Unable to save appointment', 400);
    }

    const appointment = appointmentResult.data;

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

      if (!payload.id) {
        const appointmentStartLabel = formatAppointmentTimestampForMessage(appointment);
        const statusLabel = getAppointmentStatusLabel(appointment.status);
        await sendCandidateRecruiterChannelMessage({
          serviceClient,
          candidateUserId,
          actorUserId: resolvedUserId,
          text:
            `Appointment created: "${appointment.title}" on ${appointmentStartLabel} ` +
            `(${appointment.timezone_label}). Status: ${statusLabel}.`,
        });
      }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: resolvedUserId,
      action: payload.id ? 'update_appointment' : 'create_appointment',
      entityType: 'appointments',
      entityId: appointment.id,
      afterJson: appointment,
    });

      return jsonResponse({ success: true, appointment });
    },
    { auth: 'user' },
  );

Deno.serve(scheduleOrUpdateAppointmentHandler);
