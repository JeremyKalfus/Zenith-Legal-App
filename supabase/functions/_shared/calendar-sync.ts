import { createServiceClient } from './supabase.ts';

type ServiceClient = ReturnType<typeof createServiceClient>;

type CalendarProvider = 'google' | 'apple';

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
  oauth_tokens_encrypted: string;
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

type ParsedTokens = {
  access_token?: string;
  refresh_token?: string;
  calendar_id?: string;
  oauth_tokens?: {
    access_token?: string;
    refresh_token?: string;
    calendar_id?: string;
  };
};

function parseTokens(raw: string): ParsedTokens {
  try {
    const parsed = JSON.parse(raw) as ParsedTokens;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    if (parsed.oauth_tokens && typeof parsed.oauth_tokens === 'object') {
      return {
        ...parsed,
        ...parsed.oauth_tokens,
      };
    }

    return parsed;
  } catch {
    return {};
  }
}

function formatGoogleDateTime(input: string): string {
  return input.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildGoogleTemplateUrl(appointment: AppointmentForSync): string {
  const details = [appointment.description, appointment.video_url]
    .filter((value) => Boolean(value && value.trim()))
    .join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: appointment.title,
    dates: `${formatGoogleDateTime(appointment.start_at_utc)}/${formatGoogleDateTime(appointment.end_at_utc)}`,
    details,
    location:
      appointment.modality === 'in_person'
        ? appointment.location_text ?? ''
        : appointment.video_url ?? appointment.location_text ?? '',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
    `DTSTAMP:${formatGoogleDateTime(new Date().toISOString())}`,
    `DTSTART:${formatGoogleDateTime(appointment.start_at_utc)}`,
    `DTEND:${formatGoogleDateTime(appointment.end_at_utc)}`,
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

function buildGoogleEventPayload(appointment: AppointmentForSync) {
  const description = [appointment.description, appointment.video_url]
    .filter((value) => Boolean(value && value.trim()))
    .join('\n\n');

  return {
    summary: appointment.title,
    description,
    location:
      appointment.modality === 'in_person'
        ? appointment.location_text ?? ''
        : appointment.video_url ?? appointment.location_text ?? '',
    start: {
      dateTime: appointment.start_at_utc,
      timeZone: appointment.timezone_label,
    },
    end: {
      dateTime: appointment.end_at_utc,
      timeZone: appointment.timezone_label,
    },
  };
}

async function syncGoogleEvent(
  appointment: AppointmentForSync,
  connection: CalendarConnectionRow,
  existingLink: CalendarEventLinkRow | null,
): Promise<{ providerEventId: string; providerEventUrl: string | null; syncState: Record<string, unknown> }> {
  const tokens = parseTokens(connection.oauth_tokens_encrypted);
  const accessToken = tokens.access_token;
  const calendarId = tokens.calendar_id ?? 'primary';
  const fallbackUrl = buildGoogleTemplateUrl(appointment);

  if (!accessToken) {
    return {
      providerEventId: existingLink?.provider_event_id ?? `local:${appointment.id}:${connection.user_id}`,
      providerEventUrl: fallbackUrl,
      syncState: {
        state: 'connected_missing_access_token',
        last_attempt_at: new Date().toISOString(),
      },
    };
  }

  const existingEventId = existingLink?.provider_event_id;
  const shouldPatch =
    Boolean(existingEventId) &&
    !existingEventId!.startsWith('local:') &&
    !existingEventId!.startsWith('http://') &&
    !existingEventId!.startsWith('https://') &&
    !existingEventId!.startsWith('data:');

  const endpoint = shouldPatch
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId!)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  const method = shouldPatch ? 'PATCH' : 'POST';
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildGoogleEventPayload(appointment)),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    return {
      providerEventId: existingLink?.provider_event_id ?? `local:${appointment.id}:${connection.user_id}`,
      providerEventUrl: fallbackUrl,
      syncState: {
        state: 'sync_failed',
        provider: 'google',
        last_attempt_at: new Date().toISOString(),
        error: `google_api_${response.status}`,
        detail: errorText.slice(0, 500),
      },
    };
  }

  const body = (await response.json().catch(() => ({}))) as { id?: string; htmlLink?: string };
  return {
    providerEventId: body.id ?? existingLink?.provider_event_id ?? `local:${appointment.id}:${connection.user_id}`,
    providerEventUrl: body.htmlLink ?? fallbackUrl,
    syncState: {
      state: 'synced',
      provider: 'google',
      last_attempt_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    },
  };
}

async function deleteGoogleEventIfPossible(
  connection: CalendarConnectionRow,
  eventId: string,
): Promise<void> {
  const tokens = parseTokens(connection.oauth_tokens_encrypted);
  const accessToken = tokens.access_token;
  const calendarId = tokens.calendar_id ?? 'primary';

  if (!accessToken) {
    return;
  }

  if (
    eventId.startsWith('local:') ||
    eventId.startsWith('http://') ||
    eventId.startsWith('https://') ||
    eventId.startsWith('data:')
  ) {
    return;
  }

  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  ).catch(() => undefined);
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
    .select('id,user_id,provider,oauth_tokens_encrypted,sync_state')
    .in('user_id', participantUserIds)
    .in('provider', ['google', 'apple']);

  if (connectionError || !connections || connections.length === 0) {
    return;
  }

  const typedConnections = (connections as CalendarConnectionRow[]).filter(
    (connection) => connection.provider === 'google' || connection.provider === 'apple',
  );

  if (typedConnections.length === 0) {
    return;
  }

  const { data: existingLinksData } = await serviceClient
    .from('calendar_event_links')
    .select('id,appointment_id,provider,user_id,provider_event_id,provider_event_url')
    .eq('appointment_id', appointment.id)
    .in('user_id', participantUserIds)
    .in('provider', ['google', 'apple']);

  const existingLinks = (existingLinksData ?? []) as CalendarEventLinkRow[];

  if (appointment.status !== 'scheduled') {
    for (const link of existingLinks) {
      if (link.provider !== 'google') {
        continue;
      }

      const connection = typedConnections.find(
        (candidate) => candidate.user_id === link.user_id && candidate.provider === 'google',
      );

      if (connection) {
        await deleteGoogleEventIfPossible(connection, link.provider_event_id);
      }
    }

    await serviceClient
      .from('calendar_event_links')
      .delete()
      .eq('appointment_id', appointment.id)
      .in('user_id', participantUserIds)
      .in('provider', ['google', 'apple']);

    return;
  }

  const syncHash = await hashAppointmentSnapshot(appointment);

  for (const connection of typedConnections) {
    const existingLink =
      existingLinks.find(
        (link) => link.user_id === connection.user_id && link.provider === connection.provider,
      ) ?? null;

    const syncResult =
      connection.provider === 'google'
        ? await syncGoogleEvent(appointment, connection, existingLink)
        : syncAppleEvent(appointment, connection, existingLink);

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
