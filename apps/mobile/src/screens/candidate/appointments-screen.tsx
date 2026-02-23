import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, type AppointmentInput, type AppointmentStatus } from '@zenith/shared';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ScreenShell } from '../../components/screen-shell';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/auth-context';

type AppointmentRecord = {
  id: string;
  title: string;
  description: string | null;
  start_at_utc: string;
  end_at_utc: string;
  timezone_label: string;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  status: AppointmentStatus;
};

type FunctionInvokeErrorWithContext = Error & {
  context?: Response;
};

function getDefaultValues(): AppointmentInput {
  return {
    title: '',
    description: '',
    modality: 'virtual',
    locationText: '',
    videoUrl: '',
    startAtUtc: new Date(Date.now() + 3600_000).toISOString(),
    endAtUtc: new Date(Date.now() + 7200_000).toISOString(),
    timezoneLabel: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  };
}

async function readFunctionErrorMessage(error: unknown): Promise<string> {
  const invokeError = error as FunctionInvokeErrorWithContext | undefined;
  if (invokeError?.context instanceof Response) {
    try {
      const payload = (await invokeError.context.clone().json()) as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
    } catch {
      try {
        const text = await invokeError.context.clone().text();
        if (text.trim()) {
          return text;
        }
      } catch {
        // Fall through
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Request failed';
}

function toAppointmentInput(appointment: AppointmentRecord): AppointmentInput {
  return {
    title: appointment.title,
    description: appointment.description ?? '',
    modality: appointment.modality,
    locationText: appointment.location_text ?? '',
    videoUrl: appointment.video_url ?? '',
    startAtUtc: appointment.start_at_utc,
    endAtUtc: appointment.end_at_utc,
    timezoneLabel: appointment.timezone_label,
  };
}

function statusLabel(status: AppointmentStatus): string {
  switch (status) {
    case 'requested':
      return 'Requested';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function AppointmentsScreen({
  showRecruiterBanner = true,
}: {
  showRecruiterBanner?: boolean;
}) {
  const { profile } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [serverMessage, setServerMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyAppointmentId, setBusyAppointmentId] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<AppointmentInput>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: getDefaultValues(),
  });

  const loadAppointments = useCallback(async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select(
        'id,title,description,start_at_utc,end_at_utc,timezone_label,modality,location_text,video_url,status',
      )
      .order('start_at_utc', { ascending: true });

    if (error) {
      setServerMessage(error.message);
      return;
    }

    setAppointments((data as AppointmentRecord[]) ?? []);
    setServerMessage((current) => (current.toLowerCase().includes('unable to load') ? '' : current));
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    const channel: RealtimeChannel = supabase
      .channel(`candidate-appointments-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `candidate_user_id=eq.${profile.id}`,
        },
        () => {
          void loadAppointments();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAppointments, profile?.id]);

  const visibleAppointments = useMemo(
    () => appointments,
    [appointments],
  );

  return (
    <ScreenShell showBanner={showRecruiterBanner}>
      <Text style={styles.title}>Appointments</Text>
      <Text style={styles.body}>Submit an appointment request for staff review.</Text>

      <Pressable
        style={styles.primaryCta}
        onPress={() => setShowForm((value) => !value)}
        disabled={isSubmitting}
      >
        <Text style={styles.primaryCtaText}>{showForm ? 'Close request form' : 'Request appointment'}</Text>
      </Pressable>

      {showForm ? (
        <View style={styles.formCard}>
          <Controller
            control={control}
            name="title"
            render={({ field }) => (
              <TextInput
                style={styles.input}
                placeholder="Title"
                onChangeText={field.onChange}
                value={field.value}
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

          <Controller
            control={control}
            name="videoUrl"
            render={({ field }) => (
              <TextInput
                style={styles.input}
                placeholder="Video URL"
                onChangeText={field.onChange}
                value={field.value}
              />
            )}
          />

          <Controller
            control={control}
            name="locationText"
            render={({ field }) => (
              <TextInput
                style={styles.input}
                placeholder="Location"
                onChangeText={field.onChange}
                value={field.value}
              />
            )}
          />

          <Pressable
            style={[styles.primaryCta, isSubmitting ? styles.primaryCtaDisabled : null]}
            disabled={isSubmitting}
            onPress={handleSubmit(async (values) => {
              setIsSubmitting(true);
              try {
                const { error } = await supabase.functions.invoke('schedule_or_update_appointment', {
                  body: values,
                });

                if (error) {
                  const message = await readFunctionErrorMessage(error);
                  if (message.toLowerCase().includes('conflict')) {
                    setServerMessage(
                      'That time overlaps with an existing accepted appointment. Please request a different time.',
                    );
                  } else {
                    setServerMessage(message);
                  }
                  return;
                }

                setServerMessage('Appointment request submitted. Staff will review it.');
                setShowForm(false);
                reset(getDefaultValues());
                await loadAppointments();
              } finally {
                setIsSubmitting(false);
              }
            })}
          >
            <Text style={styles.primaryCtaText}>Submit request</Text>
          </Pressable>
        </View>
      ) : null}

      {serverMessage ? <Text style={styles.serverMessage}>{serverMessage}</Text> : null}

      {visibleAppointments.map((appointment) => (
        <View key={appointment.id} style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>{appointment.title}</Text>
            <View style={[styles.statusChip, styles[`status_${appointment.status}`]]}>
              <Text style={styles.statusChipText}>{statusLabel(appointment.status)}</Text>
            </View>
          </View>
          <Text style={styles.body}>{appointment.modality === 'in_person' ? 'In-person' : 'Virtual'}</Text>
          <Text style={styles.body}>{appointment.start_at_utc}</Text>
          {appointment.status !== 'cancelled' ? (
            <Pressable
              style={[styles.secondaryCta, busyAppointmentId === appointment.id ? styles.primaryCtaDisabled : null]}
              disabled={busyAppointmentId === appointment.id}
              onPress={async () => {
                setBusyAppointmentId(appointment.id);
                try {
                  const { error } = await supabase.functions.invoke('schedule_or_update_appointment', {
                    body: {
                      id: appointment.id,
                      ...toAppointmentInput(appointment),
                      status: 'cancelled',
                    },
                  });

                  if (error) {
                    setServerMessage(await readFunctionErrorMessage(error));
                    return;
                  }

                  setServerMessage('Appointment cancelled.');
                  await loadAppointments();
                } finally {
                  setBusyAppointmentId(null);
                }
              }}
            >
              <Text style={styles.secondaryCtaText}>Cancel</Text>
            </Pressable>
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
    gap: 6,
    padding: 12,
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#0F172A',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
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
  primaryCta: {
    alignItems: 'center',
    backgroundColor: '#0C4A6E',
    borderRadius: 10,
    padding: 12,
  },
  primaryCtaDisabled: {
    opacity: 0.6,
  },
  primaryCtaText: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryCta: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  secondaryCtaText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  serverMessage: {
    color: '#0F172A',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusChipText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  status_accepted: {
    backgroundColor: '#DCFCE7',
  },
  status_cancelled: {
    backgroundColor: '#E2E8F0',
  },
  status_declined: {
    backgroundColor: '#FEE2E2',
  },
  status_requested: {
    backgroundColor: '#DBEAFE',
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
});
