import { createServiceClient } from './supabase.ts';

type ServiceClient = ReturnType<typeof createServiceClient>;

type CalendarProvider = 'apple';

type AppointmentForSync = {
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
};

type CalendarConnectionRow = {
  id: string;
  user_id: string;
  provider: CalendarProvider | 'microsoft';
  sync_state: Record<string, unknown> | null;
};

type CalendarEventLinkRow = {
  id: string;
  appointment_id: string;
  provider: CalendarProvider;
  user_id: string;
  provider_event_id: string;
  provider_event_url: string | null;
};

function formatDateTime(input: string): string {
  return input.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildAppleDataUrl(appointment: AppointmentForSync): string {
  const uid = `zenith-${appointment.id}`;
  const escapedDescription = (appointment.description ?? '').replace(/\n/g, '\\n');
  const escapedLocation =
    appointment.modality === 'in_person'
      ? (appointment.location_text ?? '')
      : (appointment.video_url ?? appointment.location_text ?? '');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zenith Legal//Appointments//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDateTime(new Date().toISOString())}`,
    `DTSTART:${formatDateTime(appointment.start_at_utc)}`,
    `DTEND:${formatDateTime(appointment.end_at_utc)}`,
    `SUMMARY:${appointment.title}`,
    `DESCRIPTION:${escapedDescription}`,
    `LOCATION:${escapedLocation}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`;
}

async function hashAppointmentSnapshot(appointment: AppointmentForSync): Promise<string> {
  const payload = JSON.stringify({
    title: appointment.title,
    description: appointment.description,
    modality: appointment.modality,
    location_text: appointment.location_text,
    video_url: appointment.video_url,
    start_at_utc: appointment.start_at_utc,
    end_at_utc: appointment.end_at_utc,
    timezone_label: appointment.timezone_label,
    status: appointment.status,
  });

  const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function syncAppleEvent(
  appointment: AppointmentForSync,
  connection: CalendarConnectionRow,
  existingLink: CalendarEventLinkRow | null,
): { providerEventId: string; providerEventUrl: string; syncState: Record<string, unknown> } {
  const dataUrl = buildAppleDataUrl(appointment);

  return {
    providerEventId: existingLink?.provider_event_id ?? `apple:${appointment.id}:${connection.user_id}`,
    providerEventUrl: dataUrl,
    syncState: {
      state: 'synced',
      provider: 'apple',
      mode: 'ics_data_url',
      last_attempt_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    },
  };
}

export async function syncAppointmentForParticipants(params: {
  serviceClient: ServiceClient;
  appointment: AppointmentForSync;
  participantUserIds: string[];
}): Promise<void> {
  const { serviceClient, appointment } = params;
  const participantUserIds = Array.from(new Set(params.participantUserIds.filter(Boolean)));

  if (participantUserIds.length === 0) {
    return;
  }

  const { data: connections, error: connectionError } = await serviceClient
    .from('calendar_connections')
    .select('id,user_id,provider,sync_state')
    .in('user_id', participantUserIds)
    .in('provider', ['apple']);

  if (connectionError || !connections || connections.length === 0) {
    return;
  }

  const typedConnections = (connections as CalendarConnectionRow[]).filter(
    (connection) => connection.provider === 'apple',
  );

  if (typedConnections.length === 0) {
    return;
  }

  const { data: existingLinksData } = await serviceClient
    .from('calendar_event_links')
    .select('id,appointment_id,provider,user_id,provider_event_id,provider_event_url')
    .eq('appointment_id', appointment.id)
    .in('user_id', participantUserIds)
    .in('provider', ['apple']);

  const existingLinks = (existingLinksData ?? []) as CalendarEventLinkRow[];

  if (appointment.status !== 'scheduled') {
    await serviceClient
      .from('calendar_event_links')
      .delete()
      .eq('appointment_id', appointment.id)
      .in('user_id', participantUserIds)
      .in('provider', ['apple']);

    return;
  }

  const syncHash = await hashAppointmentSnapshot(appointment);

  for (const connection of typedConnections) {
    const existingLink =
      existingLinks.find(
        (link) => link.user_id === connection.user_id && link.provider === connection.provider,
      ) ?? null;

    const syncResult = syncAppleEvent(appointment, connection, existingLink);

    await serviceClient.from('calendar_event_links').upsert(
      {
        appointment_id: appointment.id,
        provider: connection.provider,
        user_id: connection.user_id,
        provider_event_id: syncResult.providerEventId,
        provider_event_url: syncResult.providerEventUrl,
        sync_hash: syncHash,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: 'appointment_id,provider,user_id' },
    );

    await serviceClient
      .from('calendar_connections')
      .update({ sync_state: syncResult.syncState })
      .eq('id', connection.id);
  }
}
