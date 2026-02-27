import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

const EVENT_MAP_STORAGE_KEY_PREFIX = 'zenith.device_calendar.events.v1';

export type DeviceCalendarAppointment = {
  id: string;
  title: string;
  description: string | null;
  modality: 'virtual' | 'in_person';
  locationText: string | null;
  videoUrl: string | null;
  startAtUtc: string;
  endAtUtc: string;
  timezoneLabel: string;
  status: string;
  participantName?: string;
};

export type DeviceCalendarSyncResult = {
  status: 'synced' | 'skipped' | 'permission_denied' | 'no_calendar';
  syncedCount: number;
  removedCount: number;
  reason?: string;
};

function buildStorageKey(userId: string): string {
  return `${EVENT_MAP_STORAGE_KEY_PREFIX}:${userId}`;
}

function buildMarker(appointmentId: string): string {
  return `[ZenithAppointment:${appointmentId}]`;
}

function isScheduledStatus(status: string): boolean {
  return status === 'scheduled' || status === 'accepted';
}

function buildEventTitle(appointment: DeviceCalendarAppointment): string {
  if (!appointment.participantName) {
    return appointment.title;
  }

  return `${appointment.title} • ${appointment.participantName}`;
}

function buildEventLocation(appointment: DeviceCalendarAppointment): string | undefined {
  if (appointment.modality === 'in_person') {
    return appointment.locationText ?? undefined;
  }

  return appointment.videoUrl ?? appointment.locationText ?? undefined;
}

function buildEventNotes(appointment: DeviceCalendarAppointment): string {
  const parts: string[] = [];
  if (appointment.description?.trim()) {
    parts.push(appointment.description.trim());
  }
  if (appointment.videoUrl?.trim()) {
    parts.push(`Meeting link: ${appointment.videoUrl.trim()}`);
  }
  parts.push(buildMarker(appointment.id));
  return parts.join('\n\n');
}

async function loadEventMap(userId: string): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(buildStorageKey(userId));
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) {
        mapped[key] = value;
      }
    }
    return mapped;
  } catch {
    return {};
  }
}

async function saveEventMap(userId: string, eventMap: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(buildStorageKey(userId), JSON.stringify(eventMap));
}

async function ensureCalendarPermission(): Promise<boolean> {
  const existing = await Calendar.getCalendarPermissionsAsync();
  if (existing.granted) {
    return true;
  }

  const requested = await Calendar.requestCalendarPermissionsAsync();
  return requested.granted;
}

async function findWritableCalendarId(): Promise<string | null> {
  try {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    if (defaultCalendar?.allowsModifications) {
      return defaultCalendar.id;
    }
  } catch {
    // Fallback to calendar list below when default is unavailable on this platform.
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writablePrimary =
    calendars.find((calendar) => calendar.allowsModifications && calendar.isPrimary) ??
    calendars.find(
      (calendar) =>
        calendar.allowsModifications &&
        (calendar.accessLevel === 'owner' || calendar.accessLevel === 'editor'),
    ) ??
    calendars.find((calendar) => calendar.allowsModifications);

  return writablePrimary?.id ?? null;
}

function buildEventDetails(appointment: DeviceCalendarAppointment): Calendar.Event {
  return {
    title: buildEventTitle(appointment),
    startDate: new Date(appointment.startAtUtc),
    endDate: new Date(appointment.endAtUtc),
    timeZone: appointment.timezoneLabel,
    notes: buildEventNotes(appointment),
    location: buildEventLocation(appointment),
    url: appointment.videoUrl ?? undefined,
    alarms: [{ relativeOffset: -15 }],
  } as Calendar.Event;
}

export async function syncAppointmentsToDeviceCalendar(params: {
  userId: string;
  enabled: boolean;
  appointments: DeviceCalendarAppointment[];
}): Promise<DeviceCalendarSyncResult> {
  const { userId, enabled, appointments } = params;

  if (!enabled || !userId) {
    return { status: 'skipped', syncedCount: 0, removedCount: 0, reason: 'calendar_sync_disabled' };
  }

  if (Platform.OS === 'web') {
    return { status: 'skipped', syncedCount: 0, removedCount: 0, reason: 'web_unsupported' };
  }

  const hasPermission = await ensureCalendarPermission();
  if (!hasPermission) {
    return { status: 'permission_denied', syncedCount: 0, removedCount: 0 };
  }

  const calendarId = await findWritableCalendarId();
  if (!calendarId) {
    return { status: 'no_calendar', syncedCount: 0, removedCount: 0 };
  }

  const eventMap = await loadEventMap(userId);
  let syncedCount = 0;
  let removedCount = 0;

  for (const appointment of appointments) {
    const existingEventId = eventMap[appointment.id];
    if (isScheduledStatus(appointment.status)) {
      const eventDetails = buildEventDetails(appointment);
      if (existingEventId) {
        try {
          await Calendar.updateEventAsync(existingEventId, eventDetails);
          syncedCount += 1;
          continue;
        } catch {
          // Event might have been deleted externally; recreate it.
        }
      }

      const nextEventId = await Calendar.createEventAsync(calendarId, eventDetails);
      eventMap[appointment.id] = nextEventId;
      syncedCount += 1;
      continue;
    }

    if (!existingEventId) {
      continue;
    }

    try {
      await Calendar.deleteEventAsync(existingEventId);
    } catch {
      // Ignore if already deleted on the device.
    }
    delete eventMap[appointment.id];
    removedCount += 1;
  }

  await saveEventMap(userId, eventMap);
  return { status: 'synced', syncedCount, removedCount };
}
