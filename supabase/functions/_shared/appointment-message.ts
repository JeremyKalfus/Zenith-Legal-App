type AppointmentMessageSource = {
  description: string | null;
  location_text: string | null;
  modality: 'virtual' | 'in_person';
  start_at_utc: string;
  timezone_label: string;
  video_url: string | null;
};

function formatDateLabel(startAtUtc: string, timezoneLabel: string): string {
  const startAt = new Date(startAtUtc);
  if (Number.isNaN(startAt.getTime())) {
    return startAtUtc;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezoneLabel,
    }).format(startAt);
  } catch {
    return startAt.toISOString().slice(0, 10);
  }
}

function formatTimeLabel(startAtUtc: string, timezoneLabel: string): string {
  const startAt = new Date(startAtUtc);
  if (Number.isNaN(startAt.getTime())) {
    return startAtUtc;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezoneLabel,
      timeZoneName: 'short',
    }).format(startAt);
  } catch {
    return startAt.toISOString();
  }
}

export function buildAppointmentMessage(
  intro: string,
  params: {
    candidateName: string;
    appointment: AppointmentMessageSource;
  },
): string {
  const { appointment, candidateName } = params;
  const modalityLabel = appointment.modality === 'virtual' ? 'virtual' : 'in-person';
  const note = appointment.description?.trim() || 'No note';
  const dateLabel = formatDateLabel(appointment.start_at_utc, appointment.timezone_label);
  const timeLabel = formatTimeLabel(appointment.start_at_utc, appointment.timezone_label);

  const details = [
    `${intro} Candidate: ${candidateName}`,
    `Date: ${dateLabel}`,
    `Time: ${timeLabel}`,
    `Meeting type: ${modalityLabel}`,
  ];

  if (appointment.modality === 'virtual') {
    const videoUrl = appointment.video_url?.trim();
    if (videoUrl) {
      details.push(`Video link: ${videoUrl}`);
    }
  } else {
    const location = appointment.location_text?.trim();
    if (location) {
      details.push(`Location: ${location}`);
    }
  }

  details.push(`Note: ${note}`);

  return details.join(', ');
}
