import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, type AppointmentInput, type AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { useAuth } from '../../context/auth-context';
import { formatAppointmentDateTime } from '../../lib/date-format';
import { syncAppointmentsToDeviceCalendar } from '../../lib/device-calendar-sync';
import { supabase, ensureValidSession } from '../../lib/supabase';
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

const DURATION_OPTIONS = [
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
] as const;

const APPOINTMENT_HIDE_AFTER_MS = 24 * 60 * 60 * 1000;

function shouldHideExpiredAppointment(appointment: AppointmentRecord): boolean {
  if (appointment.status !== 'scheduled' && appointment.status !== 'declined') {
    return false;
  }

  const endTimeMs = Date.parse(appointment.end_at_utc);
  if (!Number.isFinite(endTimeMs)) {
    return false;
  }

  return endTimeMs < Date.now() - APPOINTMENT_HIDE_AFTER_MS;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Pending Review' },
  accepted: { bg: '#D1FAE5', text: '#065F46', label: 'Scheduled' },
  scheduled: { bg: '#D1FAE5', text: '#065F46', label: 'Scheduled' },
  declined: { bg: '#FEE2E2', text: '#991B1B', label: 'Declined' },
  cancelled: { bg: '#F1F5F9', text: '#64748B', label: 'Cancelled' },
};

function useAppointmentsScreen() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [serverMessage, setServerMessage] = useState('');
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lastSyncFingerprintRef = useRef('');

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
      startAtUtc: new Date(Date.now() + 3600_000).toISOString(),
      endAtUtc: new Date(Date.now() + 7200_000).toISOString(),
      timezoneLabel:
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    },
  });

  const selectedModality = watch('modality');
  const [createStartAtLocal, setCreateStartAtLocal] = useState(() => new Date(Date.now() + 3600_000));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [createDurationMinutes, setCreateDurationMinutes] = useState(30);
  const [showDurationPicker, setShowDurationPicker] = useState(false);

  const createEndAtLocal = useMemo(
    () => new Date(createStartAtLocal.getTime() + createDurationMinutes * 60_000),
    [createDurationMinutes, createStartAtLocal],
  );
  const selectedDurationLabel = useMemo(
    () =>
      DURATION_OPTIONS.find((option) => option.minutes === createDurationMinutes)
        ?.label ?? `${createDurationMinutes} min`,
    [createDurationMinutes],
  );

  useEffect(() => {
    setValue('startAtUtc', createStartAtLocal.toISOString());
    setValue('endAtUtc', createEndAtLocal.toISOString());
    setValue('timezoneLabel', Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York');
  }, [createEndAtLocal, createStartAtLocal, setValue]);

  const handleStartPickerChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowStartPicker(false);
      return;
    }

    if (selectedDate) {
      setCreateStartAtLocal(selectedDate);
    }

    if (Platform.OS === 'android') {
      setShowStartPicker(false);
    }
  }, []);

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
    const loadCalendarConnectionState = async () => {
      if (!session?.user.id) {
        setCalendarSyncEnabled(false);
        return;
      }

      const { data, error } = await supabase
        .from('calendar_connections')
        .select('provider')
        .eq('user_id', session.user.id)
        .in('provider', ['google', 'apple'])
        .limit(1);

      if (error) {
        return;
      }

      setCalendarSyncEnabled((data?.length ?? 0) > 0);
    };

    void loadCalendarConnectionState();
  }, [session?.user.id]);

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

  const appointmentSyncFingerprint = useMemo(
    () =>
      appointments
        .map((appointment) =>
          [
            appointment.id,
            appointment.status,
            appointment.start_at_utc,
            appointment.end_at_utc,
            appointment.timezone_label,
          ].join(':'),
        )
        .join('|'),
    [appointments],
  );

  useEffect(() => {
    if (!session?.user.id || !calendarSyncEnabled) {
      return;
    }

    if (appointmentSyncFingerprint === lastSyncFingerprintRef.current) {
      return;
    }

    lastSyncFingerprintRef.current = appointmentSyncFingerprint;

    void syncAppointmentsToDeviceCalendar({
      userId: session.user.id,
      enabled: calendarSyncEnabled,
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        title: appointment.title,
        description: appointment.description,
        modality: appointment.modality,
        locationText: appointment.location_text,
        videoUrl: appointment.video_url,
        startAtUtc: appointment.start_at_utc,
        endAtUtc: appointment.end_at_utc,
        timezoneLabel:
          appointment.timezone_label ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          'America/New_York',
        status: appointment.status,
      })),
    }).catch(() => undefined);
  }, [appointmentSyncFingerprint, appointments, calendarSyncEnabled, session?.user.id]);

  const toggleForm = useCallback(() => {
    setShowForm((value) => {
      const next = !value;
      if (!next) {
        setShowStartPicker(false);
        setShowDurationPicker(false);
      }
      return next;
    });
  }, []);

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
            setShowDurationPicker(false);
            reset({
              title: '',
              description: '',
              modality: 'virtual',
              locationText: undefined,
              videoUrl: undefined,
              startAtUtc: new Date(Date.now() + 3600_000).toISOString(),
              endAtUtc: new Date(Date.now() + 7200_000).toISOString(),
              timezoneLabel: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
            });
            setCreateStartAtLocal(new Date(Date.now() + 3600_000));
            setCreateDurationMinutes(30);
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
    [handleSubmit, loadAppointments, reset],
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
      <Text style={styles.cardTime}>
        {formatAppointmentDateTime(appointment.start_at_utc)} –{' '}
        {formatAppointmentDateTime(appointment.end_at_utc)}
      </Text>
      <Text style={styles.cardDetail}>
        {appointment.modality === 'virtual' ? 'Virtual' : 'In-person'}
        {appointment.location_text ? ` · ${appointment.location_text}` : ''}
      </Text>
      {appointment.description ? (
        <Text style={styles.cardDescription}>{appointment.description}</Text>
      ) : null}
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
      <Pressable style={styles.input} onPress={() => setShowStartPicker((value) => !value)}>
        <Text style={styles.valueText}>Start: {formatAppointmentDateTime(createStartAtLocal.toISOString())}</Text>
      </Pressable>
      {showStartPicker ? (
        <View style={styles.pickerShell}>
          <DateTimePicker
            value={createStartAtLocal}
            mode="datetime"
            display="spinner"
            minimumDate={new Date()}
            onChange={handleStartPickerChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.pickerDone} onPress={() => setShowStartPicker(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable style={styles.input} onPress={() => setShowDurationPicker((value) => !value)}>
        <Text style={styles.valueText}>Meeting length: {selectedDurationLabel}</Text>
      </Pressable>
      {showDurationPicker ? (
        <View style={styles.pickerShell}>
          <Picker selectedValue={createDurationMinutes} onValueChange={(value) => setCreateDurationMinutes(Number(value))}>
            {DURATION_OPTIONS.map((option) => (
              <Picker.Item key={option.minutes} label={option.label} value={option.minutes} />
            ))}
          </Picker>
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.pickerDone} onPress={() => setShowDurationPicker(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.helperText}>Ends: {formatAppointmentDateTime(createEndAtLocal.toISOString())}</Text>
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
  const {
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
  } = useAppointmentsScreen();

  return (
    <ScreenShell>
      <Text style={styles.title}>Appointments</Text>
      <Text style={styles.body}>Push reminders trigger 15 minutes before scheduled meetings.</Text>

      <Pressable
        style={interactivePressableStyle({
          base: styles.primaryCta,
          hoverStyle: sharedPressableFeedback.hover,
          focusStyle: sharedPressableFeedback.focus,
          pressedStyle: sharedPressableFeedback.pressed,
        })}
        onPress={toggleForm}
      >
        <Text style={styles.primaryCtaText}>
          {showForm ? 'Close form' : 'Request appointment'}
        </Text>
      </Pressable>

      {showForm ? (
        <AppointmentForm
          control={control}
          errors={errors}
          selectedModality={selectedModality}
          createStartAtLocal={createStartAtLocal}
          createEndAtLocal={createEndAtLocal}
          showStartPicker={showStartPicker}
          setShowStartPicker={setShowStartPicker}
          handleStartPickerChange={handleStartPickerChange}
          createDurationMinutes={createDurationMinutes}
          setCreateDurationMinutes={setCreateDurationMinutes}
          showDurationPicker={showDurationPicker}
          setShowDurationPicker={setShowDurationPicker}
          selectedDurationLabel={selectedDurationLabel}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      ) : null}

      {serverMessage ? (
        <Text style={styles.serverMessage}>{serverMessage}</Text>
      ) : null}

      {appointments.length === 0 ? (
        <Text style={styles.emptyState}>No appointments yet.</Text>
      ) : (
        appointments.map((appointment) => (
          <AppointmentCard key={appointment.id} appointment={appointment} />
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    color: uiColors.textSecondary,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  cardTime: {
    color: uiColors.link,
    fontSize: 13,
  },
  cardDetail: {
    color: uiColors.textSecondary,
    fontSize: 13,
  },
  cardDescription: {
    color: uiColors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  emptyState: {
    color: uiColors.textPlaceholder,
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  fieldError: {
    color: uiColors.errorBright,
    fontSize: 12,
    marginTop: -4,
  },
  input: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  valueText: {
    color: uiColors.textPrimary,
  },
  pickerShell: {
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pickerDone: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  pickerDoneText: {
    color: uiColors.success,
    fontWeight: '700',
  },
  helperText: {
    color: uiColors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  inputError: {
    borderColor: uiColors.errorBright,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  primaryCta: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    padding: 12,
  },
  primaryCtaDisabled: {
    opacity: 0.6,
  },
  primaryCtaText: {
    color: uiColors.primaryText,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  serverMessage: {
    backgroundColor: uiColors.backgroundAlt,
    borderRadius: 8,
    color: uiColors.textPrimary,
    fontSize: 14,
    padding: 10,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tag: {
    backgroundColor: uiColors.divider,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagSelected: {
    backgroundColor: uiColors.selectedBackground,
  },
  title: {
    color: uiColors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
});
