import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';
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
  id: z.string().uuid().optional(),
  candidateUserId: z.string().uuid().optional(),
  status: z.enum(['pending', 'scheduled', 'accepted', 'declined', 'cancelled']).optional(),
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const userId = await getCurrentUserId(authHeader);
    const client = createAuthedClient(authHeader);
    const serviceClient = createServiceClient();
    const payload = schema.parse(await request.json());

    const candidateUserId = payload.candidateUserId ?? userId;

    const { data: conflicts, error: conflictError } = await client
      .from('appointments')
      .select('id,start_at_utc,end_at_utc')
      .eq('candidate_user_id', candidateUserId)
      .eq('status', 'accepted')
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
      created_by_user_id: userId,
      title: payload.title,
      description: payload.description ?? null,
      modality: payload.modality,
      location_text: payload.locationText ?? null,
      video_url: payload.videoUrl ?? null,
      start_at_utc: payload.startAtUtc,
      end_at_utc: payload.endAtUtc,
      timezone_label: payload.timezoneLabel,
      status: payload.status ?? 'pending',
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
          user_id: userId,
          participant_type: userId === candidateUserId ? 'candidate' : 'staff',
        },
      ],
      { onConflict: 'appointment_id,user_id' },
    );

    await serviceClient.from('notification_deliveries').insert([
      {
        user_id: candidateUserId,
        channel: 'push',
        event_type: payload.id ? 'appointment.updated' : 'appointment.created',
        payload: {
          appointment_id: appointment.id,
        },
        status: 'queued',
      },
      {
        user_id: candidateUserId,
        channel: 'email',
        event_type: payload.id ? 'appointment.updated' : 'appointment.created',
        payload: {
          appointment_id: appointment.id,
        },
        status: 'queued',
      },
    ]);

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: userId,
      action: payload.id ? 'update_appointment' : 'create_appointment',
      entityType: 'appointments',
      entityId: appointment.id,
      afterJson: appointment,
    });

    return jsonResponse({ success: true, appointment });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('Unauthorized')) {
      return errorResponse(message, 401);
    }
    return errorResponse(message, 500);
  }
});
