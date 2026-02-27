export const DURATION_OPTIONS = [
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
] as const;

const APPOINTMENT_HIDE_AFTER_MS = 24 * 60 * 60 * 1000;
const HIDDEN_STATUSES = new Set(['scheduled', 'declined']);

export function shouldHideExpiredAppointment(appointment: {
  status: string;
  end_at_utc: string;
}): boolean {
  if (!HIDDEN_STATUSES.has(appointment.status)) {
    return false;
  }

  const endTimeMs = Date.parse(appointment.end_at_utc);
  if (!Number.isFinite(endTimeMs)) {
    return false;
  }

  return endTimeMs < Date.now() - APPOINTMENT_HIDE_AFTER_MS;
}

export function getResolvedTimezoneLabel(
  timezoneLabel?: string | null,
): string {
  return (
    timezoneLabel ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'America/New_York'
  );
}

export function buildAppointmentSyncFingerprint(
  appointments: {
    id: string;
    status: string;
    start_at_utc: string;
    end_at_utc: string;
    timezone_label: string;
  }[],
): string {
  return appointments
    .map((appointment) =>
      [
        appointment.id,
        appointment.status,
        appointment.start_at_utc,
        appointment.end_at_utc,
        appointment.timezone_label,
      ].join(':'),
    )
    .join('|');
}

type AppointmentCalendarSource = {
  description: string | null;
  end_at_utc: string;
  id: string;
  location_text: string | null;
  modality: 'virtual' | 'in_person';
  start_at_utc: string;
  status: string;
  timezone_label?: string | null;
  title: string;
  video_url: string | null;
};

export function mapToDeviceCalendarAppointment(
  appointment: AppointmentCalendarSource,
  participantName?: string,
) {
  return {
    id: appointment.id,
    title: appointment.title,
    description: appointment.description,
    modality: appointment.modality,
    locationText: appointment.location_text,
    videoUrl: appointment.video_url,
    startAtUtc: appointment.start_at_utc,
    endAtUtc: appointment.end_at_utc,
    timezoneLabel: getResolvedTimezoneLabel(appointment.timezone_label),
    status: appointment.status,
    participantName,
  };
}
