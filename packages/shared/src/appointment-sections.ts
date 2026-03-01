export type AppointmentSectionSource = {
  id: string;
  status: string;
  start_at_utc: string;
  end_at_utc: string;
  candidate_user_id: string;
  created_by_user_id: string;
};

export type CandidateAppointmentSections<TAppointment> = {
  overdueConfirmed: TAppointment[];
  outgoingRequests: TAppointment[];
  upcomingAppointments: TAppointment[];
};

export type StaffAppointmentSections<TAppointment> = {
  overdueConfirmed: TAppointment[];
  incomingRequests: TAppointment[];
  upcomingAppointments: TAppointment[];
};

function parseStartTimeMs(appointment: Pick<AppointmentSectionSource, 'start_at_utc'>): number | null {
  const startTimeMs = Date.parse(appointment.start_at_utc);
  return Number.isFinite(startTimeMs) ? startTimeMs : null;
}

export function isOverdueConfirmedAppointment(
  appointment: Pick<AppointmentSectionSource, 'status' | 'start_at_utc'>,
  nowMs = Date.now(),
): boolean {
  const startTimeMs = parseStartTimeMs(appointment);
  return appointment.status === 'scheduled' && startTimeMs !== null && startTimeMs < nowMs;
}

export function isUpcomingConfirmedAppointment(
  appointment: Pick<AppointmentSectionSource, 'status' | 'start_at_utc'>,
  nowMs = Date.now(),
): boolean {
  const startTimeMs = parseStartTimeMs(appointment);
  return appointment.status === 'scheduled' && (startTimeMs === null || startTimeMs >= nowMs);
}

export function bucketCandidateAppointments<TAppointment extends AppointmentSectionSource>(
  appointments: TAppointment[],
  candidateUserId: string,
  nowMs = Date.now(),
): CandidateAppointmentSections<TAppointment> {
  const overdueConfirmed: TAppointment[] = [];
  const outgoingRequests: TAppointment[] = [];
  const upcomingAppointments: TAppointment[] = [];

  for (const appointment of appointments) {
    if (isOverdueConfirmedAppointment(appointment, nowMs)) {
      overdueConfirmed.push(appointment);
      continue;
    }

    if (
      appointment.status === 'pending' &&
      appointment.created_by_user_id === candidateUserId &&
      appointment.candidate_user_id === candidateUserId
    ) {
      outgoingRequests.push(appointment);
      continue;
    }

    if (isUpcomingConfirmedAppointment(appointment, nowMs)) {
      upcomingAppointments.push(appointment);
    }
  }

  return {
    overdueConfirmed,
    outgoingRequests,
    upcomingAppointments,
  };
}

export function bucketStaffAppointments<TAppointment extends AppointmentSectionSource>(
  appointments: TAppointment[],
  nowMs = Date.now(),
): StaffAppointmentSections<TAppointment> {
  const overdueConfirmed: TAppointment[] = [];
  const incomingRequests: TAppointment[] = [];
  const upcomingAppointments: TAppointment[] = [];

  for (const appointment of appointments) {
    if (isOverdueConfirmedAppointment(appointment, nowMs)) {
      overdueConfirmed.push(appointment);
      continue;
    }

    if (
      appointment.status === 'pending' &&
      appointment.created_by_user_id === appointment.candidate_user_id
    ) {
      incomingRequests.push(appointment);
      continue;
    }

    if (isUpcomingConfirmedAppointment(appointment, nowMs)) {
      upcomingAppointments.push(appointment);
    }
  }

  return {
    overdueConfirmed,
    incomingRequests,
    upcomingAppointments,
  };
}
