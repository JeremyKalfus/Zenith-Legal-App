import { createServiceClient } from './supabase.ts';

const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const REMINDER_OFFSET_MINUTES = 15;
const REMINDER_OFFSET_MS =
  REMINDER_OFFSET_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

export function buildReminderSendAfter(startAtUtc: string): string | null {
  const reminderAtMs = Date.parse(startAtUtc) - REMINDER_OFFSET_MS;
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

type QueueCancelledParams = {
  serviceClient: ReturnType<typeof createServiceClient>;
  appointmentId: string;
  recipientUserIds: Iterable<string>;
};

export async function queueAppointmentCancelledNotifications({
  serviceClient,
  appointmentId,
  recipientUserIds,
}: QueueCancelledParams) {
  const recipients = Array.from(new Set(recipientUserIds));
  if (recipients.length === 0) {
    return;
  }

  const rows = recipients.flatMap((userId) => [
    {
      user_id: userId,
      channel: 'push',
      event_type: 'appointment.cancelled',
      payload: {
        appointment_id: appointmentId,
      },
      status: 'queued',
    },
    {
      user_id: userId,
      channel: 'email',
      event_type: 'appointment.cancelled',
      payload: {
        appointment_id: appointmentId,
      },
      status: 'queued',
    },
  ]);

  await serviceClient.from('notification_deliveries').insert(rows);
}
