import { createServiceClient } from './supabase.ts';

export function buildReminderSendAfter(startAtUtc: string): string | null {
  const reminderAtMs = Date.parse(startAtUtc) - 15 * 60 * 1000;
  if (!Number.isFinite(reminderAtMs)) {
    return null;
  }

  return reminderAtMs > Date.now() ? new Date(reminderAtMs).toISOString() : null;
}

type QueueStatusNotificationParams = {
  serviceClient: ReturnType<typeof createServiceClient>;
  candidateUserId: string;
  appointmentId: string;
  eventType: 'appointment.created' | 'appointment.updated';
  status: string;
};

export async function queueAppointmentStatusNotifications({
  serviceClient,
  candidateUserId,
  appointmentId,
  eventType,
  status,
}: QueueStatusNotificationParams) {
  await serviceClient.from('notification_deliveries').insert([
    {
      user_id: candidateUserId,
      channel: 'push',
      event_type: eventType,
      payload: {
        appointment_id: appointmentId,
        status,
        decision: status === 'scheduled' ? 'scheduled' : undefined,
      },
      status: 'queued',
    },
    {
      user_id: candidateUserId,
      channel: 'email',
      event_type: eventType,
      payload: {
        appointment_id: appointmentId,
        status,
        decision: status === 'scheduled' ? 'scheduled' : undefined,
      },
      status: 'queued',
    },
  ]);
}

type QueueReminderParams = {
  serviceClient: ReturnType<typeof createServiceClient>;
  appointmentId: string;
  startAtUtc: string;
  participantUserIds: Iterable<string>;
};

export async function queueAppointmentReminderNotifications({
  serviceClient,
  appointmentId,
  startAtUtc,
  participantUserIds,
}: QueueReminderParams) {
  const reminderSendAfter = buildReminderSendAfter(startAtUtc);
  if (!reminderSendAfter) {
    return;
  }

  await serviceClient.from('notification_deliveries').insert(
    Array.from(new Set(participantUserIds)).map((userId) => ({
      user_id: userId,
      channel: 'push',
      event_type: 'appointment.reminder',
      payload: {
        appointment_id: appointmentId,
        start_at_utc: startAtUtc,
      },
      send_after_utc: reminderSendAfter,
      status: 'queued',
    })),
  );
}
