import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  bucketCandidateAppointments,
  type AppointmentStatus,
} from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { CandidatePageTitle } from '../../components/candidate-page-title';
import { useAuth } from '../../context/auth-context';
import { supabase, ensureValidSession } from '../../lib/supabase';
import { getFunctionErrorMessage } from '../../lib/function-error';
import {
  mapToDeviceCalendarAppointment,
} from '../../lib/appointments-shared';
import { useCalendarSyncEnabled } from '../../lib/use-calendar-sync-enabled';
import { useAppointmentCalendarSync } from '../../lib/use-appointment-calendar-sync';
import { appointmentSharedStyles } from '../shared/appointment-shared-styles';
import { AppointmentCardDetails } from '../shared/appointment-card-details';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';

type AppointmentRecord = {
  id: string;
  title: string;
  description: string | null;
  start_at_utc: string;
  end_at_utc: string;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  status: AppointmentStatus;
  timezone_label: string;
  candidate_user_id: string;
  created_by_user_id: string;
};

type AppointmentAction = 'ignore_overdue' | 'cancel_upcoming';

type CardTone = 'overdue' | 'outgoing' | 'upcoming';

function formatAppointmentDateHeader(iso: string, timezoneLabel: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezoneLabel,
  });
}

function useAppointmentsScreen() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [serverMessage, setServerMessage] = useState('');
  const [actingAppointmentId, setActingAppointmentId] = useState<string | null>(null);
  const calendarSyncEnabled = useCalendarSyncEnabled(session?.user.id);

  const loadAppointments = useCallback(async () => {
    if (!session?.user?.id) {
      setAppointments([]);
      return;
    }

    const { data, error } = await supabase
      .from('appointments')
      .select(
        'id,title,description,start_at_utc,end_at_utc,modality,location_text,video_url,status,timezone_label,candidate_user_id,created_by_user_id',
      )
      .eq('candidate_user_id', session.user.id)
      .order('start_at_utc', { ascending: true });

    if (error) {
      setServerMessage(error.message);
      return;
    }

    const mapped = (data as AppointmentRecord[]) ?? [];
    setAppointments(mapped);
  }, [session?.user?.id]);

  useEffect(() => {
    void loadAppointments();

    const channel = supabase
      .channel(`candidate-appointments-realtime-${session?.user?.id ?? 'anonymous'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          void loadAppointments();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAppointments, session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadAppointments();
      return undefined;
    }, [loadAppointments]),
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      void loadAppointments();
    }, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadAppointments]);

  const sections = useMemo(
    () => bucketCandidateAppointments(appointments, session?.user.id ?? ''),
    [appointments, session?.user.id],
  );

  const toDeviceCalendarAppointment = useCallback(
    (appointment: AppointmentRecord) => mapToDeviceCalendarAppointment(appointment),
    [],
  );

  useAppointmentCalendarSync({
    appointments,
    calendarSyncEnabled,
    userId: session?.user.id,
    toDeviceCalendarAppointment,
  });

  const runLifecycleAction = useCallback(
    async (appointmentId: string, action: AppointmentAction, successMessage: string) => {
      try {
        setActingAppointmentId(appointmentId);
        setServerMessage('');
        await ensureValidSession();

        const { error } = await supabase.functions.invoke('manage_appointment_lifecycle', {
          body: {
            appointment_id: appointmentId,
            action,
          },
        });

        if (error) {
          setServerMessage(await getFunctionErrorMessage(error));
          return;
        }

        setServerMessage(successMessage);
        await loadAppointments();
      } catch (err) {
        setServerMessage((err as Error).message);
      } finally {
        setActingAppointmentId(null);
      }
    },
    [loadAppointments],
  );

  return {
    sections,
    serverMessage,
    actingAppointmentId,
    runLifecycleAction,
  };
}

function AppointmentCard({
  appointment,
  tone,
  actionLabel,
  actionBusyLabel,
  onAction,
  actionDisabled,
}: {
  appointment: AppointmentRecord;
  tone: CardTone;
  actionLabel?: string;
  actionBusyLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  const badgeStyle =
    tone === 'overdue'
      ? styles.overdueBadge
      : tone === 'outgoing'
        ? styles.outgoingBadge
        : styles.upcomingBadge;
  const badgeTextStyle =
    tone === 'overdue'
      ? styles.overdueBadgeText
      : tone === 'outgoing'
        ? styles.outgoingBadgeText
        : styles.upcomingBadgeText;
  const toneBorder =
    tone === 'overdue'
      ? styles.cardOverdue
      : tone === 'outgoing'
        ? styles.cardOutgoing
        : undefined;

  const statusLabel = tone === 'overdue'
    ? 'Overdue'
    : tone === 'outgoing'
      ? 'Outgoing request'
      : 'Scheduled';

  return (
    <View style={[styles.card, toneBorder]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {formatAppointmentDateHeader(appointment.start_at_utc, appointment.timezone_label)}
        </Text>
        <View style={[styles.statusBadge, badgeStyle]}>
          <Text style={[styles.statusText, badgeTextStyle]}>{statusLabel}</Text>
        </View>
      </View>
      <AppointmentCardDetails
        description={appointment.description}
        locationText={appointment.location_text}
        metaVariant="time_only"
        modality={appointment.modality}
        startAtUtc={appointment.start_at_utc}
        styles={styles}
        timezoneLabel={appointment.timezone_label}
        videoUrl={appointment.video_url}
      />
      {actionLabel && onAction ? (
        <Pressable
          style={interactivePressableStyle({
            base: styles.secondaryAction,
            disabled: actionDisabled,
            disabledStyle: styles.primaryCtaDisabled,
            hoverStyle: sharedPressableFeedback.hover,
            focusStyle: sharedPressableFeedback.focus,
            pressedStyle: sharedPressableFeedback.pressed,
          })}
          onPress={onAction}
          disabled={actionDisabled}
        >
          <Text style={styles.secondaryActionText}>
            {actionDisabled ? (actionBusyLabel ?? 'Saving...') : actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AppointmentSection({
  title,
  appointments,
  tone,
  actionLabel,
  actionBusyLabel,
  onAction,
  actingAppointmentId,
}: {
  title: string;
  appointments: AppointmentRecord[];
  tone: CardTone;
  actionLabel?: string;
  actionBusyLabel?: string;
  onAction?: (appointmentId: string) => void;
  actingAppointmentId: string | null;
}) {
  if (appointments.length === 0) {
    return null;
  }

  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionHeader}>{title} ({appointments.length})</Text>
      {appointments.map((appointment) => (
        <AppointmentCard
          key={appointment.id}
          appointment={appointment}
          tone={tone}
          actionLabel={actionLabel}
          actionBusyLabel={actionBusyLabel}
          onAction={onAction ? () => onAction(appointment.id) : undefined}
          actionDisabled={actingAppointmentId === appointment.id}
        />
      ))}
    </View>
  );
}

export function AppointmentsScreen() {
  const screen = useAppointmentsScreen();
  const hasSections =
    screen.sections.overdueConfirmed.length > 0 ||
    screen.sections.upcomingAppointments.length > 0;

  return (
    <ScreenShell>
      <CandidatePageTitle title="Appointments" />
      <Text style={styles.body}>View and manage your appointments with Zenith Legal.</Text>

      {screen.serverMessage ? (
        <Text style={styles.serverMessage}>{screen.serverMessage}</Text>
      ) : null}

      <AppointmentSection
        title="Overdue"
        appointments={screen.sections.overdueConfirmed}
        tone="overdue"
        actionLabel="Ignore"
        actionBusyLabel="Ignoring..."
        actingAppointmentId={screen.actingAppointmentId}
        onAction={(appointmentId) =>
          void screen.runLifecycleAction(appointmentId, 'ignore_overdue', 'Overdue appointment ignored.')
        }
      />

      <AppointmentSection
        title="Upcoming Appointments"
        appointments={screen.sections.upcomingAppointments}
        tone="upcoming"
        actionLabel="Cancel"
        actionBusyLabel="Canceling..."
        actingAppointmentId={screen.actingAppointmentId}
        onAction={(appointmentId) =>
          void screen.runLifecycleAction(
            appointmentId,
            'cancel_upcoming',
            'Upcoming appointment canceled.',
          )
        }
      />

      {!hasSections ? (
        <Text style={styles.emptyState}>No appointments yet.</Text>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  ...appointmentSharedStyles,
  sectionBlock: {
    gap: 8,
  },
  sectionHeader: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  cardOverdue: {
    borderColor: uiColors.errorBright,
    borderWidth: 1,
  },
  cardOutgoing: {
    borderColor: '#EA580C',
    borderWidth: 1,
  },
  overdueBadge: {
    backgroundColor: '#FEE2E2',
  },
  outgoingBadge: {
    backgroundColor: '#FFEDD5',
  },
  upcomingBadge: {
    backgroundColor: uiColors.surface,
  },
  overdueBadgeText: {
    color: '#991B1B',
  },
  outgoingBadgeText: {
    color: '#9A3412',
  },
  upcomingBadgeText: {
    color: uiColors.textSecondary,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: uiColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  fieldError: {
    color: uiColors.errorBright,
    fontSize: 12,
    marginTop: -4,
  },
  inputError: {
    borderColor: uiColors.errorBright,
  },
  serverMessage: {
    backgroundColor: uiColors.backgroundAlt,
    borderRadius: 8,
    color: uiColors.textPrimary,
    fontSize: 14,
    padding: 10,
  },
});
