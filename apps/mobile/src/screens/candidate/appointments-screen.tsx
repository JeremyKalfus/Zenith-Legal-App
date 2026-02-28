import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, type AppointmentInput, type AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { CandidatePageTitle } from '../../components/candidate-page-title';
import { useAuth } from '../../context/auth-context';
import { supabase, ensureValidSession } from '../../lib/supabase';
import {
  getResolvedTimezoneLabel,
  mapToDeviceCalendarAppointment,
  shouldHideExpiredAppointment,
} from '../../lib/appointments-shared';
import { useAppointmentComposer } from '../../lib/use-appointment-composer';
import { useCalendarSyncEnabled } from '../../lib/use-calendar-sync-enabled';
import { useAppointmentCalendarSync } from '../../lib/use-appointment-calendar-sync';
import { appointmentSharedStyles } from '../shared/appointment-shared-styles';
import { AppointmentCardDetails } from '../shared/appointment-card-details';
import { AppointmentTimingControls } from '../shared/appointment-timing-controls';
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
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Pending Review' },
  accepted: { bg: '#D1FAE5', text: '#065F46', label: 'Scheduled' },
  scheduled: { bg: '#D1FAE5', text: '#065F46', label: 'Scheduled' },
  declined: { bg: '#FEE2E2', text: '#991B1B', label: 'Declined' },
  cancelled: { bg: '#F1F5F9', text: '#64748B', label: 'Cancelled' },
};
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const ONE_HOUR_MS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
const TWO_HOURS_MS = ONE_HOUR_MS * 2;

function useAppointmentsScreen() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [serverMessage, setServerMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const calendarSyncEnabled = useCalendarSyncEnabled(session?.user.id);
  const {
    createDurationMinutes,
    createEndAtLocal,
    createStartAtLocal,
    handleStartPickerChange,
    resetComposer,
    selectedDurationLabel,
    setCreateDurationMinutes,
    setShowDurationPicker,
    setShowStartPicker,
    showDurationPicker,
    showStartPicker,
  } = useAppointmentComposer();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AppointmentInput>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '',
      modality: 'virtual',
      startAtUtc: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
      endAtUtc: new Date(Date.now() + TWO_HOURS_MS).toISOString(),
      timezoneLabel: getResolvedTimezoneLabel(),
    },
  });

  const selectedModality = watch('modality');

  useEffect(() => {
    setValue('startAtUtc', createStartAtLocal.toISOString());
    setValue('endAtUtc', createEndAtLocal.toISOString());
    setValue('timezoneLabel', getResolvedTimezoneLabel());
  }, [createEndAtLocal, createStartAtLocal, setValue]);

  const loadAppointments = useCallback(async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select('id,title,description,start_at_utc,end_at_utc,modality,location_text,video_url,status,timezone_label')
      .order('start_at_utc', { ascending: true });

    if (error) {
      setServerMessage(error.message);
      return;
    }

    const mapped = ((data as AppointmentRecord[]) ?? []).filter(
      (appointment) => !shouldHideExpiredAppointment(appointment),
    );
    setAppointments(mapped);
    setServerMessage('');
  }, []);

  useEffect(() => {
    void loadAppointments();

    const channel = supabase
      .channel('appointments-realtime')
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
  }, [loadAppointments]);
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

  const toggleForm = useCallback(() => {
    setShowForm((value) => {
      const next = !value;
      if (!next) {
        resetComposer();
      }
      return next;
    });
  }, [resetComposer]);

  const onSubmit = useCallback(
    () =>
      handleSubmit(
        async (values) => {
          try {
            setSubmitting(true);
            setServerMessage('');
            await ensureValidSession();

            const { error } = await supabase.functions.invoke(
              'schedule_or_update_appointment',
              { body: values },
            );

            if (error) {
              setServerMessage(error.message);
              return;
            }

            setServerMessage('Appointment request submitted.');
            setShowForm(false);
            resetComposer();
            reset({
              title: '',
              description: '',
              modality: 'virtual',
              locationText: undefined,
              videoUrl: undefined,
              startAtUtc: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
              endAtUtc: new Date(Date.now() + TWO_HOURS_MS).toISOString(),
              timezoneLabel: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
            });
            await loadAppointments();
          } catch (err) {
            setServerMessage((err as Error).message);
          } finally {
            setSubmitting(false);
          }
        },
        (formErrors) => {
          const firstError = Object.values(formErrors)[0];
          setServerMessage(firstError?.message ?? 'Please fix the highlighted fields.');
        },
      )(),
    [handleSubmit, loadAppointments, reset, resetComposer],
  );

  return {
    appointments,
    serverMessage,
    showForm,
    submitting,
    control,
    errors,
    selectedModality,
    createStartAtLocal,
    createEndAtLocal,
    showStartPicker,
    setShowStartPicker,
    handleStartPickerChange,
    createDurationMinutes,
    setCreateDurationMinutes,
    showDurationPicker,
    setShowDurationPicker,
    selectedDurationLabel,
    toggleForm,
    onSubmit,
  };
}

function AppointmentCard({ appointment }: { appointment: AppointmentRecord }) {
  const statusInfo = STATUS_COLORS[appointment.status] ?? STATUS_COLORS.scheduled;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{appointment.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
          <Text style={[styles.statusText, { color: statusInfo.text }]}>
            {statusInfo.label}
          </Text>
        </View>
      </View>
      <AppointmentCardDetails
        description={appointment.description}
        endAtUtc={appointment.end_at_utc}
        locationText={appointment.location_text}
        modality={appointment.modality}
        startAtUtc={appointment.start_at_utc}
        styles={styles}
      />
    </View>
  );
}

function AppointmentForm({
  control,
  errors,
  selectedModality,
  createStartAtLocal,
  createEndAtLocal,
  showStartPicker,
  setShowStartPicker,
  handleStartPickerChange,
  createDurationMinutes,
  setCreateDurationMinutes,
  showDurationPicker,
  setShowDurationPicker,
  selectedDurationLabel,
  submitting,
  onSubmit,
}: {
  control: ReturnType<typeof useAppointmentsScreen>['control'];
  errors: ReturnType<typeof useAppointmentsScreen>['errors'];
  selectedModality: string | undefined;
  createStartAtLocal: Date;
  createEndAtLocal: Date;
  showStartPicker: boolean;
  setShowStartPicker: (value: boolean | ((value: boolean) => boolean)) => void;
  handleStartPickerChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  createDurationMinutes: number;
  setCreateDurationMinutes: (minutes: number) => void;
  showDurationPicker: boolean;
  setShowDurationPicker: (value: boolean | ((value: boolean) => boolean)) => void;
  selectedDurationLabel: string;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.formCard}>
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <>
            <TextInput
              style={[styles.input, errors.title ? styles.inputError : null]}
              placeholder="Title"
              onChangeText={field.onChange}
              value={field.value}
            />
            {errors.title ? (
              <Text style={styles.fieldError}>{errors.title.message ?? 'Title is required'}</Text>
            ) : null}
          </>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description (optional)"
            onChangeText={field.onChange}
            value={field.value ?? ''}
            multiline
            numberOfLines={3}
          />
        )}
      />
      <Controller
        control={control}
        name="modality"
        render={({ field }) => (
          <View style={styles.row}>
            <Pressable
              style={[styles.tag, field.value === 'virtual' ? styles.tagSelected : null]}
              onPress={() => field.onChange('virtual')}
            >
              <Text>Virtual</Text>
            </Pressable>
            <Pressable
              style={[styles.tag, field.value === 'in_person' ? styles.tagSelected : null]}
              onPress={() => field.onChange('in_person')}
            >
              <Text>In-person</Text>
            </Pressable>
          </View>
        )}
      />
      <AppointmentTimingControls
        createDurationMinutes={createDurationMinutes}
        createEndAtLocal={createEndAtLocal}
        createStartAtLocal={createStartAtLocal}
        handleStartPickerChange={handleStartPickerChange}
        selectedDurationLabel={selectedDurationLabel}
        setCreateDurationMinutes={setCreateDurationMinutes}
        setShowDurationPicker={setShowDurationPicker}
        setShowStartPicker={setShowStartPicker}
        showDurationPicker={showDurationPicker}
        showStartPicker={showStartPicker}
        styles={styles}
      />
      {selectedModality === 'virtual' ? (
        <Controller
          control={control}
          name="videoUrl"
          render={({ field }) => (
            <>
              <TextInput
                style={[styles.input, errors.videoUrl ? styles.inputError : null]}
                placeholder="Video URL (optional)"
                onChangeText={(text) => field.onChange(text || undefined)}
                value={field.value ?? ''}
              />
              {errors.videoUrl ? (
                <Text style={styles.fieldError}>{errors.videoUrl.message}</Text>
              ) : null}
            </>
          )}
        />
      ) : null}
      {selectedModality === 'in_person' ? (
        <Controller
          control={control}
          name="locationText"
          render={({ field }) => (
            <TextInput
              style={styles.input}
              placeholder="Location (optional)"
              onChangeText={(text) => field.onChange(text || undefined)}
              value={field.value ?? ''}
            />
          )}
        />
      ) : null}
      <Pressable
        style={interactivePressableStyle({
          base: styles.primaryCta,
          disabled: submitting,
          disabledStyle: styles.primaryCtaDisabled,
          hoverStyle: sharedPressableFeedback.hover,
          focusStyle: sharedPressableFeedback.focus,
          pressedStyle: sharedPressableFeedback.pressed,
        })}
        disabled={submitting}
        onPress={onSubmit}
      >
        <Text style={styles.primaryCtaText}>
          {submitting ? 'Submitting\u2026' : 'Submit request'}
        </Text>
      </Pressable>
    </View>
  );
}

export function AppointmentsScreen() {
  const screen = useAppointmentsScreen();

  return (
    <ScreenShell>
      <CandidatePageTitle title="Appointments" />
      <Text style={styles.body}>Push reminders trigger 15 minutes before scheduled meetings.</Text>

      <Pressable
        style={interactivePressableStyle({
          base: styles.primaryCta,
          hoverStyle: sharedPressableFeedback.hover,
          focusStyle: sharedPressableFeedback.focus,
          pressedStyle: sharedPressableFeedback.pressed,
        })}
        onPress={screen.toggleForm}
      >
        <Text style={styles.primaryCtaText}>
          {screen.showForm ? 'Close form' : 'Request appointment'}
        </Text>
      </Pressable>

      {screen.showForm ? (
        <AppointmentForm
          control={screen.control}
          errors={screen.errors}
          selectedModality={screen.selectedModality}
          createStartAtLocal={screen.createStartAtLocal}
          createEndAtLocal={screen.createEndAtLocal}
          showStartPicker={screen.showStartPicker}
          setShowStartPicker={screen.setShowStartPicker}
          handleStartPickerChange={screen.handleStartPickerChange}
          createDurationMinutes={screen.createDurationMinutes}
          setCreateDurationMinutes={screen.setCreateDurationMinutes}
          showDurationPicker={screen.showDurationPicker}
          setShowDurationPicker={screen.setShowDurationPicker}
          selectedDurationLabel={screen.selectedDurationLabel}
          submitting={screen.submitting}
          onSubmit={screen.onSubmit}
        />
      ) : null}

      {screen.serverMessage ? (
        <Text style={styles.serverMessage}>{screen.serverMessage}</Text>
      ) : null}

      {screen.appointments.length === 0 ? (
        <Text style={styles.emptyState}>No appointments yet.</Text>
      ) : (
        screen.appointments.map((appointment) => (
          <AppointmentCard key={appointment.id} appointment={appointment} />
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  ...appointmentSharedStyles,
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
