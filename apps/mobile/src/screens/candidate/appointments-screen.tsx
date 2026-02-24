import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, type AppointmentInput, type AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { supabase, ensureValidSession } from '../../lib/supabase';

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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AppointmentsScreen() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [serverMessage, setServerMessage] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { control, handleSubmit, reset } = useForm<AppointmentInput>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '',
      modality: 'virtual',
      locationText: '',
      videoUrl: '',
      startAtUtc: new Date(Date.now() + 3600_000).toISOString(),
      endAtUtc: new Date(Date.now() + 7200_000).toISOString(),
      timezoneLabel:
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    },
  });

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

  return (
    <ScreenShell>
      <Text style={styles.title}>Appointments</Text>
      <Text style={styles.body}>Default reminders trigger at 24h and 1h.</Text>

      <Pressable
        style={styles.primaryCta}
        onPress={() => setShowForm((value) => !value)}
      >
        <Text style={styles.primaryCtaText}>
          {showForm ? 'Close form' : 'Request appointment'}
        </Text>
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
                  style={[
                    styles.tag,
                    field.value === 'virtual' ? styles.tagSelected : null,
                  ]}
                  onPress={() => field.onChange('virtual')}
                >
                  <Text>Virtual</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.tag,
                    field.value === 'in_person' ? styles.tagSelected : null,
                  ]}
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
                placeholder="Video URL (required for virtual)"
                onChangeText={field.onChange}
                value={field.value ?? ''}
              />
            )}
          />

          <Controller
            control={control}
            name="locationText"
            render={({ field }) => (
              <TextInput
                style={styles.input}
                placeholder="Location (required for in-person)"
                onChangeText={field.onChange}
                value={field.value ?? ''}
              />
            )}
          />

          <Pressable
            style={styles.primaryCta}
            onPress={handleSubmit(async (values) => {
              try {
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
              }
            })}
          >
            <Text style={styles.primaryCtaText}>Submit request</Text>
          </Pressable>
        </View>
      ) : null}

      {serverMessage ? (
        <Text style={styles.serverMessage}>{serverMessage}</Text>
      ) : null}

      {appointments.length === 0 ? (
        <Text style={styles.emptyState}>No appointments yet.</Text>
      ) : (
        appointments.map((appointment) => {
          const statusInfo = STATUS_COLORS[appointment.status] ?? STATUS_COLORS.scheduled;
          return (
            <View key={appointment.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{appointment.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                  <Text style={[styles.statusText, { color: statusInfo.text }]}>
                    {statusInfo.label}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardTime}>
                {formatDateTime(appointment.start_at_utc)} – {formatDateTime(appointment.end_at_utc)}
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
        })
      )}
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
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#0F172A',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  cardTime: {
    color: '#2563EB',
    fontSize: 13,
  },
  cardDetail: {
    color: '#475569',
    fontSize: 13,
  },
  cardDescription: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 2,
  },
  emptyState: {
    color: '#94A3B8',
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
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
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
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
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  serverMessage: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    color: '#0F172A',
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
