import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const appointmentSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
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
});

type ExistingAppointment = {
  id: string;
  candidate_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
};

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
    const { data: profile, error: profileError } = await client
      .from('users_profile')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return errorResponse(profileError?.message ?? 'Unable to load profile', 400);
    }

    if (profile.role === 'staff') {
      return errorResponse('Staff cannot create or update appointment requests from this endpoint', 403);
    }

    let existingAppointment: ExistingAppointment | null = null;

    if (payload.id) {
      const { data, error } = await client
        .from('appointments')
        .select('id,candidate_user_id,status')
        .eq('id', payload.id)
        .single();

      if (error || !data) {
        return errorResponse(error?.message ?? 'Appointment not found', 404);
      }

      existingAppointment = data as ExistingAppointment;
    }

    const candidateUserId = existingAppointment?.candidate_user_id ?? userId;

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
      return errorResponse(
        'You already have an accepted appointment in this time window. Please choose a different time.',
        409,
      );
    }

    const dbPayload = {
      candidate_user_id: candidateUserId,
      created_by_user_id: userId,
      title: payload.title && payload.title.trim().length > 0 ? payload.title : 'Appointment request',
      description: payload.description ?? null,
      modality: payload.modality,
      location_text: payload.locationText ?? null,
      video_url: payload.videoUrl ?? null,
      start_at_utc: payload.startAtUtc,
      end_at_utc: payload.endAtUtc,
      timezone_label: payload.timezoneLabel,
      status: existingAppointment?.status ?? 'pending',
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
