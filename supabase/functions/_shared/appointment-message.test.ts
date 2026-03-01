import { buildAppointmentMessage } from './appointment-message.ts';

Deno.test('buildAppointmentMessage includes video link for virtual appointments when present', () => {
  const message = buildAppointmentMessage('Appointment scheduled.', {
    candidateName: 'Jane Doe',
    appointment: {
      description: 'Bring resume',
      location_text: null,
      modality: 'virtual',
      start_at_utc: '2026-03-01T15:30:00.000Z',
      timezone_label: 'America/New_York',
      video_url: 'https://zoom.us/j/123',
    },
  });

  if (!message.includes('Appointment scheduled. Candidate: Jane Doe')) {
    throw new Error('Expected intro + candidate segment.');
  }
  if (!message.includes('Meeting type: virtual')) {
    throw new Error('Expected virtual meeting type segment.');
  }
  if (!message.includes('Video link: https://zoom.us/j/123')) {
    throw new Error('Expected video link segment.');
  }
  if (!message.includes('Note: Bring resume')) {
    throw new Error('Expected note segment.');
  }
  if (message.includes('Location:')) {
    throw new Error('Did not expect location for virtual appointment.');
  }
});

Deno.test('buildAppointmentMessage includes location for in-person appointments when present', () => {
  const message = buildAppointmentMessage('Appointment request accepted and scheduled.', {
    candidateName: 'John Smith',
    appointment: {
      description: 'No note',
      location_text: '123 Main St',
      modality: 'in_person',
      start_at_utc: '2026-03-01T15:30:00.000Z',
      timezone_label: 'America/New_York',
      video_url: null,
    },
  });

  if (!message.includes('Meeting type: in-person')) {
    throw new Error('Expected in-person meeting type segment.');
  }
  if (!message.includes('Location: 123 Main St')) {
    throw new Error('Expected location segment.');
  }
  if (message.includes('Video link:')) {
    throw new Error('Did not expect video link for in-person appointment.');
  }
});

Deno.test('buildAppointmentMessage omits empty location/video and falls back to no note', () => {
  const virtualMessage = buildAppointmentMessage('Scheduled appointment modified.', {
    candidateName: 'Alex Candidate',
    appointment: {
      description: null,
      location_text: null,
      modality: 'virtual',
      start_at_utc: '2026-03-01T15:30:00.000Z',
      timezone_label: 'America/New_York',
      video_url: '   ',
    },
  });

  if (virtualMessage.includes('Video link:')) {
    throw new Error('Did not expect empty video link segment.');
  }
  if (!virtualMessage.includes('Note: No note')) {
    throw new Error('Expected No note fallback.');
  }

  const inPersonMessage = buildAppointmentMessage('Scheduled appointment canceled.', {
    candidateName: 'Alex Candidate',
    appointment: {
      description: '',
      location_text: '   ',
      modality: 'in_person',
      start_at_utc: '2026-03-01T15:30:00.000Z',
      timezone_label: 'America/New_York',
      video_url: null,
    },
  });

  if (inPersonMessage.includes('Location:')) {
    throw new Error('Did not expect empty location segment.');
  }
});
