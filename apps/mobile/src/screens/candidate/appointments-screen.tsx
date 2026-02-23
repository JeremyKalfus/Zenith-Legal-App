import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, type AppointmentInput, type AppointmentStatus } from '@zenith/shared';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ScreenShell } from '../../components/screen-shell';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/auth-context';

type AppointmentRecord = {
  id: string;
  candidate_user_id: string;
  title: string;
  start_at_utc: string;
  end_at_utc: string;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  status: AppointmentStatus;
  candidate_name?: string | null;
  candidate_email?: string | null;
};

type PickerState = { field: 'start' | 'end'; mode: 'date' | 'time' } | null;

function formatDateLabel(value: string | undefined): string {
  if (!value) {
    return 'Select date';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Select date' : date.toLocaleDateString();
}

function formatTimeLabel(value: string | undefined): string {
  if (!value) {
    return 'Select time';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Select time'
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function mergeDatePart(baseIso: string, selected: Date): string {
  const next = new Date(baseIso);
  next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  return next.toISOString();
}

function mergeTimePart(baseIso: string, selected: Date): string {
  const next = new Date(baseIso);
  next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  return next.toISOString();
}

export function AppointmentsScreen({
  showRecruiterBanner = true,
  mode = 'candidate',
}: {
  showRecruiterBanner?: boolean;
  mode?: 'candidate' | 'staff';
}) {
  const { session } = useAuth();
  const isStaffMode = mode === 'staff';
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [serverMessage, setServerMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [reviewingAppointmentId, setReviewingAppointmentId] = useState<string | null>(null);
  const [reviewingDecision, setReviewingDecision] = useState<'accepted' | 'declined' | null>(null);
  const [pickerState, setPickerState] = useState<PickerState>(null);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AppointmentInput>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '',
      description: '',
      modality: 'virtual',
      locationText: '',
      videoUrl: undefined,
      startAtUtc: new Date(Date.now() + 3600_000).toISOString(),
      endAtUtc: new Date(Date.now() + 7200_000).toISOString(),
      timezoneLabel:
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    },
  });
  const selectedModality = watch('modality') ?? 'virtual';
  const startAtUtc = watch('startAtUtc');
  const endAtUtc = watch('endAtUtc');

  const getValidDate = useCallback((value: string | undefined, fallbackMsOffset: number) => {
    const parsed = value ? new Date(value) : new Date(Date.now() + fallbackMsOffset);
    if (Number.isNaN(parsed.getTime())) {
      return new Date(Date.now() + fallbackMsOffset);
    }
    return parsed;
  }, []);

  const loadAppointments = useCallback(async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select('id,candidate_user_id,title,start_at_utc,end_at_utc,modality,location_text,video_url,status')
      .order('start_at_utc', { ascending: true });

    if (error) {
      setServerMessage(error.message);
      return;
    }

    const rows = ((data as AppointmentRecord[]) ?? []).map((appointment) => ({
      ...appointment,
      candidate_name: null,
      candidate_email: null,
    }));

    if (isStaffMode && rows.length > 0) {
      const candidateIds = [...new Set(rows.map((appointment) => appointment.candidate_user_id))];
      const { data: candidateProfiles, error: candidateProfilesError } = await supabase
        .from('users_profile')
        .select('id,name,email')
        .in('id', candidateIds);

      if (candidateProfilesError) {
        setServerMessage(candidateProfilesError.message);
        return;
      }

      const candidateById = new Map(
        ((candidateProfiles as Array<{ id: string; name: string | null; email: string }> | null) ?? []).map(
          (candidate) => [candidate.id, candidate],
        ),
      );

      setAppointments(
        rows.map((appointment) => {
          const candidate = candidateById.get(appointment.candidate_user_id);
          return {
            ...appointment,
            candidate_name: candidate?.name ?? null,
            candidate_email: candidate?.email ?? null,
          };
        }),
      );
    } else {
      setAppointments(rows);
    }

    setServerMessage('');
  }, [isStaffMode]);

  async function extractFunctionInvokeErrorMessage(error: unknown, data?: unknown): Promise<string> {
    if (typeof data === 'object' && data && 'error' in data) {
      const payloadMessage = (data as { error?: unknown }).error;
      if (typeof payloadMessage === 'string' && payloadMessage.trim()) {
        return payloadMessage;
      }
    }

    if (typeof error === 'object' && error && 'context' in error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const json = (await context.clone().json()) as { error?: unknown; message?: unknown };
          if (typeof json.error === 'string' && json.error.trim()) {
            return json.error;
          }
          if (typeof json.message === 'string' && json.message.trim()) {
            return json.message;
          }
        } catch {
          try {
            const text = await context.clone().text();
            if (text.trim()) {
              return text;
            }
          } catch {
            // Fall back below.
          }
        }
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'Request failed';
  }

  const invokeAuthedFunction = useCallback(
    async (name: string, body: Record<string, unknown>) => {
      const currentSession = session ?? (await supabase.auth.getSession()).data.session;

      if (!currentSession?.access_token) {
        return {
          data: null,
          error: new Error('Your session has expired. Please sign in again and retry.'),
        };
      }

      return supabase.functions.invoke(name, {
        body,
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });
    },
    [session],
  );

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS !== 'ios') {
        setPickerState(null);
      }

      if (!pickerState || event.type === 'dismissed' || !selectedDate) {
        return;
      }

      const fieldName = pickerState.field === 'start' ? 'startAtUtc' : 'endAtUtc';
      const fallbackOffset = pickerState.field === 'start' ? 3600_000 : 7200_000;
      const baseIso = getValidDate(
        pickerState.field === 'start' ? startAtUtc : endAtUtc,
        fallbackOffset,
      ).toISOString();
      const nextIso =
        pickerState.mode === 'date'
          ? mergeDatePart(baseIso, selectedDate)
          : mergeTimePart(baseIso, selectedDate);

      setValue(fieldName, nextIso, { shouldValidate: true, shouldDirty: true });
    },
    [endAtUtc, getValidDate, pickerState, setValue, startAtUtc],
  );

  function getStatusLabel(status: AppointmentStatus): string {
    if (status === 'pending') {
      return 'Pending';
    }
    if (status === 'accepted') {
      return 'Accepted';
    }
    if (status === 'declined') {
      return 'Declined';
    }
    return 'Cancelled';
  }

  function getStatusStyle(status: AppointmentStatus) {
    if (status === 'accepted') {
      return styles.statusAccepted;
    }
    if (status === 'declined') {
      return styles.statusDeclined;
    }
    if (status === 'cancelled') {
      return styles.statusCancelled;
    }
    return styles.statusPending;
  }

  const reviewAppointment = useCallback(
    async (appointmentId: string, decision: 'accepted' | 'declined') => {
      setReviewingAppointmentId(appointmentId);
      setReviewingDecision(decision);
      setServerMessage('');

      const { error, data } = await invokeAuthedFunction('staff_review_appointment', {
        appointmentId,
        decision,
      });

      if (error) {
        setServerMessage(await extractFunctionInvokeErrorMessage(error, data));
        setReviewingAppointmentId(null);
        setReviewingDecision(null);
        return;
      }

      setServerMessage(decision === 'accepted' ? 'Appointment accepted.' : 'Appointment declined.');
      setReviewingAppointmentId(null);
      setReviewingDecision(null);
      await loadAppointments();
    },
    [invokeAuthedFunction, loadAppointments],
  );

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    const channel = supabase
      .channel(`appointments:${mode}:${Date.now()}`)
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
  }, [loadAppointments, mode]);

  const activePickerValue = pickerState
    ? pickerState.field === 'start'
      ? getValidDate(startAtUtc, 3600_000)
      : getValidDate(endAtUtc, 7200_000)
    : null;

  return (
    <ScreenShell showBanner={showRecruiterBanner}>
      <Text style={styles.title}>Appointments</Text>
      <Text style={styles.body}>Default reminders trigger at 24h and 1h.</Text>

      {!isStaffMode ? (
        <Pressable
          style={styles.primaryCta}
          onPress={() => setShowForm((value) => !value)}
        >
          <Text style={styles.primaryCtaText}>
            {showForm ? 'Close form' : 'Request appointment'}
          </Text>
        </Pressable>
      ) : null}

      {!isStaffMode && showForm ? (
        <View style={styles.formCard}>
          <Controller
            control={control}
            name="title"
            render={({ field }) => (
              <TextInput
                style={styles.input}
                placeholder="Title (optional)"
                onChangeText={(value) => field.onChange(value.trim().length > 0 ? value : undefined)}
                value={field.value ?? ''}
              />
            )}
          />
          {errors.title?.message ? (
            <Text style={styles.fieldError}>{errors.title.message}</Text>
          ) : null}

          <Controller
            control={control}
            name="modality"
            render={({ field }) => (
              <View style={styles.row}>
                <Pressable
                  style={[
                    styles.tag,
                    field.value === 'virtual' ? styles.tagSelected : null,
                  ]}
                  onPress={() => {
                    field.onChange('virtual');
                    setValue('locationText', undefined);
                  }}
                >
                  <Text>Virtual</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.tag,
                    field.value === 'in_person' ? styles.tagSelected : null,
                  ]}
                  onPress={() => {
                    field.onChange('in_person');
                    setValue('videoUrl', undefined);
                  }}
                >
                  <Text>In-person</Text>
                </Pressable>
              </View>
            )}
          />

          {selectedModality === 'virtual' ? (
            <>
              <Controller
                control={control}
                name="videoUrl"
                render={({ field }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="Video URL (optional)"
                    onChangeText={(value) => field.onChange(value.trim().length > 0 ? value : undefined)}
                    value={field.value ?? ''}
                  />
                )}
              />
              {errors.videoUrl?.message ? (
                <Text style={styles.fieldError}>{errors.videoUrl.message}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Controller
                control={control}
                name="locationText"
                render={({ field }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="Location (optional)"
                    onChangeText={(value) => field.onChange(value.trim().length > 0 ? value : undefined)}
                    value={field.value ?? ''}
                  />
                )}
              />
              {errors.locationText?.message ? (
                <Text style={styles.fieldError}>{errors.locationText.message}</Text>
              ) : null}
            </>
          )}
          <View style={styles.timeSection}>
            <Text style={styles.sectionLabel}>Start time</Text>
            <View style={styles.row}>
              <Pressable
                style={styles.timeButton}
                onPress={() => setPickerState({ field: 'start', mode: 'date' })}
              >
                <Text style={styles.timeButtonText}>{formatDateLabel(startAtUtc)}</Text>
              </Pressable>
              <Pressable
                style={styles.timeButton}
                onPress={() => setPickerState({ field: 'start', mode: 'time' })}
              >
                <Text style={styles.timeButtonText}>{formatTimeLabel(startAtUtc)}</Text>
              </Pressable>
            </View>
            <Text style={styles.sectionLabel}>End time</Text>
            <View style={styles.row}>
              <Pressable
                style={styles.timeButton}
                onPress={() => setPickerState({ field: 'end', mode: 'date' })}
              >
                <Text style={styles.timeButtonText}>{formatDateLabel(endAtUtc)}</Text>
              </Pressable>
              <Pressable
                style={styles.timeButton}
                onPress={() => setPickerState({ field: 'end', mode: 'time' })}
              >
                <Text style={styles.timeButtonText}>{formatTimeLabel(endAtUtc)}</Text>
              </Pressable>
            </View>
          </View>
          {activePickerValue && pickerState ? (
            <DateTimePicker
              value={activePickerValue}
              mode={pickerState.mode}
              display="default"
              onChange={handlePickerChange}
            />
          ) : null}
          {errors.startAtUtc?.message ? (
            <Text style={styles.fieldError}>{errors.startAtUtc.message}</Text>
          ) : null}
          {errors.endAtUtc?.message ? (
            <Text style={styles.fieldError}>{errors.endAtUtc.message}</Text>
          ) : null}

          <Pressable
            style={styles.primaryCta}
            onPress={handleSubmit(
              async (values) => {
                const { error, data } = await invokeAuthedFunction(
                  'schedule_or_update_appointment',
                  values,
                );

                if (error) {
                  setServerMessage(await extractFunctionInvokeErrorMessage(error, data));
                  return;
                }

                setServerMessage('Appointment request submitted.');
                setShowForm(false);
                reset();
                await loadAppointments();
              },
              () => {
                setServerMessage('Please fix the form errors and try again.');
              },
            )}
          >
            <Text style={styles.primaryCtaText}>Submit request</Text>
          </Pressable>
        </View>
      ) : null}

      {serverMessage ? <Text style={styles.serverMessage}>{serverMessage}</Text> : null}

      {appointments.map((appointment) => (
        <View key={appointment.id} style={styles.card}>
          {isStaffMode ? (
            <Text style={styles.metaText}>
              Candidate:{' '}
              {appointment.candidate_name?.trim() ||
                appointment.candidate_email?.trim() ||
                appointment.candidate_user_id}
            </Text>
          ) : null}
          <Text style={styles.cardTitle}>{appointment.title}</Text>
          <Text style={styles.body}>{appointment.modality}</Text>
          <Text style={styles.body}>{appointment.start_at_utc}</Text>
          <View style={[styles.statusBadge, getStatusStyle(appointment.status)]}>
            <Text style={styles.statusBadgeText}>{getStatusLabel(appointment.status)}</Text>
          </View>
          {isStaffMode && appointment.status === 'pending' ? (
            <View style={styles.row}>
              <Pressable
                style={[
                  styles.secondaryCta,
                  styles.acceptCta,
                  reviewingAppointmentId === appointment.id ? styles.ctaDisabled : null,
                ]}
                disabled={reviewingAppointmentId === appointment.id}
                onPress={() => void reviewAppointment(appointment.id, 'accepted')}
              >
                <Text style={styles.secondaryCtaText}>
                  {reviewingAppointmentId === appointment.id && reviewingDecision === 'accepted'
                    ? 'Accepting...'
                    : 'Accept'}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryCta,
                  styles.declineCta,
                  reviewingAppointmentId === appointment.id ? styles.ctaDisabled : null,
                ]}
                disabled={reviewingAppointmentId === appointment.id}
                onPress={() => void reviewAppointment(appointment.id, 'declined')}
              >
                <Text style={styles.secondaryCtaText}>
                  {reviewingAppointmentId === appointment.id && reviewingDecision === 'declined'
                    ? 'Declining...'
                    : 'Decline'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#475569',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  declineCta: {
    backgroundColor: '#991B1B',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  fieldError: {
    color: '#B91C1C',
    fontSize: 12,
    marginTop: -4,
  },
  metaText: {
    color: '#334155',
    fontSize: 12,
  },
  primaryCta: {
    alignItems: 'center',
    backgroundColor: '#0C4A6E',
    borderRadius: 10,
    padding: 12,
  },
  primaryCtaText: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  secondaryCta: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    padding: 10,
  },
  secondaryCtaText: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  serverMessage: {
    color: '#0F172A',
  },
  statusAccepted: {
    backgroundColor: '#DCFCE7',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  statusCancelled: {
    backgroundColor: '#E2E8F0',
  },
  statusDeclined: {
    backgroundColor: '#FEE2E2',
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  timeButton: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  timeButtonText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  timeSection: {
    gap: 8,
  },
  tag: {
    backgroundColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagSelected: {
    backgroundColor: '#BAE6FD',
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
  acceptCta: {
    backgroundColor: '#166534',
  },
});
