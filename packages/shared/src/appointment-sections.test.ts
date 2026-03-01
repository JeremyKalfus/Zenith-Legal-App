import { describe, expect, it } from 'vitest';
import {
  bucketCandidateAppointments,
  bucketStaffAppointments,
  isOverdueConfirmedAppointment,
  isUpcomingConfirmedAppointment,
  type AppointmentSectionSource,
} from './appointment-sections';

function buildAppointment(overrides: Partial<AppointmentSectionSource>): AppointmentSectionSource {
  return {
    id: 'appointment-1',
    status: 'pending',
    start_at_utc: '2026-03-01T14:00:00.000Z',
    end_at_utc: '2026-03-01T15:00:00.000Z',
    candidate_user_id: 'candidate-1',
    created_by_user_id: 'candidate-1',
    ...overrides,
  };
}

describe('appointment sections', () => {
  const nowMs = Date.parse('2026-03-01T15:00:00.000Z');

  it('treats scheduled appointments starting before now as overdue confirmed', () => {
    const appointment = buildAppointment({
      status: 'scheduled',
      start_at_utc: '2026-03-01T14:59:59.000Z',
    });

    expect(isOverdueConfirmedAppointment(appointment, nowMs)).toBe(true);
  });

  it('treats scheduled appointments starting exactly at now as upcoming', () => {
    const appointment = buildAppointment({
      status: 'scheduled',
      start_at_utc: '2026-03-01T15:00:00.000Z',
    });

    expect(isOverdueConfirmedAppointment(appointment, nowMs)).toBe(false);
    expect(isUpcomingConfirmedAppointment(appointment, nowMs)).toBe(true);
  });

  it('buckets candidate appointments by overdue/outgoing/upcoming rules', () => {
    const appointments = [
      buildAppointment({ id: 'overdue', status: 'scheduled', start_at_utc: '2026-03-01T12:00:00.000Z' }),
      buildAppointment({ id: 'outgoing', status: 'pending', created_by_user_id: 'candidate-1' }),
      buildAppointment({ id: 'admin-pending', status: 'pending', created_by_user_id: 'staff-1' }),
      buildAppointment({ id: 'upcoming', status: 'scheduled', start_at_utc: '2026-03-01T18:00:00.000Z' }),
      buildAppointment({ id: 'cancelled', status: 'cancelled' }),
    ];

    const buckets = bucketCandidateAppointments(appointments, 'candidate-1', nowMs);

    expect(buckets.overdueConfirmed.map((row) => row.id)).toEqual(['overdue']);
    expect(buckets.outgoingRequests.map((row) => row.id)).toEqual(['outgoing']);
    expect(buckets.upcomingAppointments.map((row) => row.id)).toEqual(['upcoming']);
  });

  it('buckets staff appointments by overdue/incoming/upcoming rules', () => {
    const appointments = [
      buildAppointment({ id: 'overdue', status: 'scheduled', start_at_utc: '2026-03-01T12:00:00.000Z' }),
      buildAppointment({ id: 'incoming', status: 'pending', created_by_user_id: 'candidate-1' }),
      buildAppointment({ id: 'staff-created-pending', status: 'pending', created_by_user_id: 'staff-1' }),
      buildAppointment({ id: 'upcoming', status: 'scheduled', start_at_utc: '2026-03-01T18:00:00.000Z' }),
      buildAppointment({ id: 'declined', status: 'declined' }),
    ];

    const buckets = bucketStaffAppointments(appointments, nowMs);

    expect(buckets.overdueConfirmed.map((row) => row.id)).toEqual(['overdue']);
    expect(buckets.incomingRequests.map((row) => row.id)).toEqual(['incoming']);
    expect(buckets.upcomingAppointments.map((row) => row.id)).toEqual(['upcoming']);
  });
});
