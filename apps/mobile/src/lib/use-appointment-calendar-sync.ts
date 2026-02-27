import { useEffect, useMemo, useRef } from 'react';
import {
  syncAppointmentsToDeviceCalendar,
  type DeviceCalendarAppointment,
} from './device-calendar-sync';
import { buildAppointmentSyncFingerprint } from './appointments-shared';

type UseAppointmentCalendarSyncParams<TAppointment> = {
  appointments: TAppointment[];
  calendarSyncEnabled: boolean;
  userId: string | undefined;
  toDeviceCalendarAppointment: (appointment: TAppointment) => DeviceCalendarAppointment;
};

type AppointmentFingerprintSource = {
  id: string;
  status: string;
  start_at_utc: string;
  end_at_utc: string;
  timezone_label: string;
};

export function useAppointmentCalendarSync<TAppointment extends AppointmentFingerprintSource>({
  appointments,
  calendarSyncEnabled,
  userId,
  toDeviceCalendarAppointment,
}: UseAppointmentCalendarSyncParams<TAppointment>) {
  const lastSyncFingerprintRef = useRef('');
  const appointmentSyncFingerprint = useMemo(
    () => buildAppointmentSyncFingerprint(appointments),
    [appointments],
  );

  useEffect(() => {
    if (!userId || !calendarSyncEnabled) {
      return;
    }

    if (appointmentSyncFingerprint === lastSyncFingerprintRef.current) {
      return;
    }

    lastSyncFingerprintRef.current = appointmentSyncFingerprint;

    void syncAppointmentsToDeviceCalendar({
      userId,
      enabled: calendarSyncEnabled,
      appointments: appointments.map(toDeviceCalendarAppointment),
    }).catch(() => undefined);
  }, [appointmentSyncFingerprint, appointments, calendarSyncEnabled, toDeviceCalendarAppointment, userId]);
}
