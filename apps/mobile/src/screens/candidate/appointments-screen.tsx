import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, type AppointmentInput, type AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { formatAppointmentDateTime } from '../../lib/date-format';
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
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Pending Review' },
  accepted: { bg: '#D1FAE5', text: '#065F46', label: 'Accepted' },
  declined: { bg: '#FEE2E2', text: '#991B1B', label: 'Declined' },
  cancelled: { bg: '#F1F5F9', text: '#64748B', label: 'Cancelled' },
  scheduled: { bg: '#DBEAFE', text: '#1E40AF', label: 'Scheduled' },
};

function useAppointmentsScreen() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [serverMessage, setServerMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
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

  const loadAppointments = useCallback(async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select('id,title,description,start_at_utc,end_at_utc,modality,location_text,video_url,status')
      .order('start_at_utc', { ascending: true });

    if (error) {
      setServerMessage(error.message);
      return;
    }

    setAppointments((data as AppointmentRecord[]) ?? []);
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

  const toggleForm = useCallback(() => setShowForm((value) => !value), []);

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
            reset();
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
    [handleSubmit, reset, loadAppointments],
  );

  return {
    appointments,
    serverMessage,
    showForm,
    submitting,
    control,
    errors,
    selectedModality,
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
  submitting,
  onSubmit,
}: {
  control: ReturnType<typeof useAppointmentsScreen>['control'];
  errors: ReturnType<typeof useAppointmentsScreen>['errors'];
  selectedModality: string | undefined;
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
    toggleForm,
    onSubmit,
  } = useAppointmentsScreen();

  return (
    <ScreenShell>
      <Text style={styles.title}>Appointments</Text>
      <Text style={styles.body}>Default reminders trigger at 24h and 1h.</Text>

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
