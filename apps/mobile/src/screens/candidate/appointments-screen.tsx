import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, type AppointmentInput } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { supabase } from '../../lib/supabase';

type AppointmentRecord = {
  id: string;
  title: string;
  start_at_utc: string;
  end_at_utc: string;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
};

export function AppointmentsScreen({
  showRecruiterBanner = true,
}: {
  showRecruiterBanner?: boolean;
}) {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [serverMessage, setServerMessage] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { control, handleSubmit, reset } = useForm<AppointmentInput>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '',
      description: '',
      modality: 'virtual',
      locationText: '',
      videoUrl: '',
      startAtUtc: new Date(Date.now() + 3600_000).toISOString(),
      endAtUtc: new Date(Date.now() + 7200_000).toISOString(),
      timezoneLabel:
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    },
  });

  const loadAppointments = async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select('id,title,start_at_utc,end_at_utc,modality,location_text,video_url')
      .order('start_at_utc', { ascending: true });

    if (error) {
      setServerMessage(error.message);
      return;
    }

    setAppointments((data as AppointmentRecord[]) ?? []);
    setServerMessage('');
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  return (
    <ScreenShell showBanner={showRecruiterBanner}>
      <Text style={styles.title}>Appointments</Text>
      <Text style={styles.body}>Default reminders trigger at 24h and 1h.</Text>

      <Pressable
        style={styles.primaryCta}
        onPress={() => setShowForm((value) => !value)}
      >
        <Text style={styles.primaryCtaText}>
          {showForm ? 'Close form' : 'Create appointment'}
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
            style={styles.primaryCta}
            onPress={handleSubmit(async (values) => {
              const { error } = await supabase.functions.invoke(
                'schedule_or_update_appointment',
                {
                  body: values,
                },
              );

              if (error) {
                setServerMessage(error.message);
                return;
              }

              setServerMessage('Appointment saved.');
              setShowForm(false);
              reset();
              loadAppointments();
            })}
          >
            <Text style={styles.primaryCtaText}>Save appointment</Text>
          </Pressable>
        </View>
      ) : null}

      {serverMessage ? <Text style={styles.serverMessage}>{serverMessage}</Text> : null}

      {appointments.map((appointment) => (
        <View key={appointment.id} style={styles.card}>
          <Text style={styles.cardTitle}>{appointment.title}</Text>
          <Text style={styles.body}>{appointment.modality}</Text>
          <Text style={styles.body}>{appointment.start_at_utc}</Text>
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
  primaryCtaText: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  serverMessage: {
    color: '#0F172A',
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
