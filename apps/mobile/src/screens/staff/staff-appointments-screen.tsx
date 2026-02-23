import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { supabase } from '../../lib/supabase';

type StaffAppointmentRecord = {
  id: string;
  candidate_user_id: string;
  title: string;
  description: string | null;
  start_at_utc: string;
  end_at_utc: string;
  timezone_label: string;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  status: AppointmentStatus;
  candidate: Array<{
    name: string | null;
    email: string | null;
  }> | null;
};

type StaffAppointmentDraft = {
  title: string;
  description: string;
  modality: 'virtual' | 'in_person';
  locationText: string;
  videoUrl: string;
  startAtUtc: string;
  endAtUtc: string;
  timezoneLabel: string;
};

type FunctionInvokeErrorWithContext = Error & { context?: Response };

const STATUS_FILTERS: AppointmentStatus[] = ['requested', 'accepted', 'declined', 'cancelled'];

function statusLabel(status: AppointmentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function toDraft(appointment: StaffAppointmentRecord): StaffAppointmentDraft {
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
        // Ignore and fall back.
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Request failed';
}

export function StaffAppointmentsScreen() {
  const [appointments, setAppointments] = useState<StaffAppointmentRecord[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StaffAppointmentDraft | null>(null);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus>('requested');
  const [serverMessage, setServerMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadAppointments = useCallback(async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select(
        'id,candidate_user_id,title,description,start_at_utc,end_at_utc,timezone_label,modality,location_text,video_url,status,candidate:users_profile!appointments_candidate_user_id_fkey(name,email)',
      )
      .order('start_at_utc', { ascending: true });

    if (error) {
      setServerMessage(error.message);
      return;
    }

    const nextAppointments = ((data ?? []) as unknown) as StaffAppointmentRecord[];
    setAppointments(nextAppointments);

    setSelectedAppointmentId((currentId) => {
      const nextSelectedId = currentId && nextAppointments.some((item) => item.id === currentId)
        ? currentId
        : nextAppointments.find((item) => item.status === statusFilter)?.id ?? nextAppointments[0]?.id ?? null;

      const selected = nextAppointments.find((item) => item.id === nextSelectedId) ?? null;
      setDraft(selected ? toDraft(selected) : null);
      return nextSelectedId;
    });
  }, [statusFilter]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel('staff-appointments')
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

  const filteredAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.status === statusFilter),
    [appointments, statusFilter],
  );

  const selectedAppointment = useMemo(
    () => appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null,
    [appointments, selectedAppointmentId],
  );

  const invokeStaffUpdate = useCallback(
    async (statusOverride?: 'accepted' | 'declined' | 'cancelled') => {
      if (!selectedAppointment || !draft) {
        return;
      }

      setIsSaving(true);
      try {
        const payload = {
          id: selectedAppointment.id,
          ...draft,
          status: statusOverride,
        };

        const { error } = await supabase.functions.invoke('staff_update_appointment', {
          body: payload,
        });

        if (error) {
          const message = await readFunctionErrorMessage(error);
          if (message.toLowerCase().includes('conflict')) {
            setServerMessage('Cannot accept this appointment because it overlaps another accepted appointment.');
          } else {
            setServerMessage(message);
          }
          return;
        }

        setServerMessage(
          statusOverride ? `Appointment ${statusOverride}.` : 'Appointment details updated.',
        );
        await loadAppointments();
      } finally {
        setIsSaving(false);
      }
    },
    [draft, loadAppointments, selectedAppointment],
  );

  return (
    <ScreenShell showBanner={false}>
      <Text style={styles.title}>Staff Appointments</Text>
      <Text style={styles.body}>Review all appointment requests. Staff can edit and accept/decline/cancel.</Text>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((status) => (
          <Pressable
            key={status}
            style={[styles.filterChip, statusFilter === status ? styles.filterChipActive : null]}
            onPress={() => setStatusFilter(status)}
          >
            <Text style={styles.filterChipText}>{statusLabel(status)}</Text>
          </Pressable>
        ))}
      </View>

      {serverMessage ? <Text style={styles.serverMessage}>{serverMessage}</Text> : null}

      <View style={styles.splitColumn}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Filtered Appointments ({filteredAppointments.length})</Text>
          {filteredAppointments.map((appointment) => (
            <Pressable
              key={appointment.id}
              style={[
                styles.listItem,
                selectedAppointmentId === appointment.id ? styles.listItemSelected : null,
              ]}
              onPress={() => {
                setSelectedAppointmentId(appointment.id);
                setDraft(toDraft(appointment));
              }}
            >
              <Text style={styles.listItemTitle}>{appointment.title}</Text>
              <Text style={styles.body}>
                {appointment.candidate?.[0]?.name ??
                  appointment.candidate?.[0]?.email ??
                  appointment.candidate_user_id}
              </Text>
              <Text style={styles.body}>{appointment.start_at_utc}</Text>
              <Text style={styles.statusText}>Status: {statusLabel(appointment.status)}</Text>
            </Pressable>
          ))}
          {filteredAppointments.length === 0 ? <Text style={styles.body}>No appointments in this status.</Text> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Appointment Review</Text>
          {selectedAppointment && draft ? (
            <View style={styles.formStack}>
              <Text style={styles.body}>
                Candidate:{' '}
                {selectedAppointment.candidate?.[0]?.name ?? selectedAppointment.candidate_user_id}
              </Text>
              <Text style={styles.body}>Current status: {statusLabel(selectedAppointment.status)}</Text>

              <TextInput
                style={styles.input}
                value={draft.title}
                placeholder="Title"
                onChangeText={(value) => setDraft((current) => (current ? { ...current, title: value } : current))}
              />
              <TextInput
                style={styles.input}
                value={draft.description}
                placeholder="Description"
                onChangeText={(value) => setDraft((current) => (current ? { ...current, description: value } : current))}
              />

              <View style={styles.row}>
                <Pressable
                  style={[styles.tag, draft.modality === 'virtual' ? styles.tagSelected : null]}
                  onPress={() => setDraft((current) => (current ? { ...current, modality: 'virtual' } : current))}
                >
                  <Text>Virtual</Text>
                </Pressable>
                <Pressable
                  style={[styles.tag, draft.modality === 'in_person' ? styles.tagSelected : null]}
                  onPress={() => setDraft((current) => (current ? { ...current, modality: 'in_person' } : current))}
                >
                  <Text>In-person</Text>
                </Pressable>
              </View>

              <TextInput
                style={styles.input}
                value={draft.videoUrl}
                placeholder="Video URL"
                onChangeText={(value) => setDraft((current) => (current ? { ...current, videoUrl: value } : current))}
              />
              <TextInput
                style={styles.input}
                value={draft.locationText}
                placeholder="Location"
                onChangeText={(value) => setDraft((current) => (current ? { ...current, locationText: value } : current))}
              />
              <TextInput
                style={styles.input}
                value={draft.startAtUtc}
                placeholder="Start ISO time"
                onChangeText={(value) => setDraft((current) => (current ? { ...current, startAtUtc: value } : current))}
              />
              <TextInput
                style={styles.input}
                value={draft.endAtUtc}
                placeholder="End ISO time"
                onChangeText={(value) => setDraft((current) => (current ? { ...current, endAtUtc: value } : current))}
              />
              <TextInput
                style={styles.input}
                value={draft.timezoneLabel}
                placeholder="Timezone"
                onChangeText={(value) => setDraft((current) => (current ? { ...current, timezoneLabel: value } : current))}
              />

              <Pressable
                style={[styles.primaryCta, isSaving ? styles.disabled : null]}
                disabled={isSaving}
                onPress={() => {
                  void invokeStaffUpdate();
                }}
              >
                <Text style={styles.primaryCtaText}>Save edits</Text>
              </Pressable>

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.acceptCta, isSaving ? styles.disabled : null]}
                  disabled={isSaving}
                  onPress={() => {
                    void invokeStaffUpdate('accepted');
                  }}
                >
                  <Text style={styles.primaryCtaText}>Accept</Text>
                </Pressable>
                <Pressable
                  style={[styles.declineCta, isSaving ? styles.disabled : null]}
                  disabled={isSaving}
                  onPress={() => {
                    void invokeStaffUpdate('declined');
                  }}
                >
                  <Text style={styles.primaryCtaText}>Decline</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryCta, isSaving ? styles.disabled : null]}
                  disabled={isSaving}
                  onPress={() => {
                    void invokeStaffUpdate('cancelled');
                  }}
                >
                  <Text style={styles.secondaryCtaText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Text style={styles.body}>Select an appointment to review.</Text>
          )}
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  acceptCta: {
    alignItems: 'center',
    backgroundColor: '#166534',
    borderRadius: 10,
    flex: 1,
    padding: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  body: {
    color: '#475569',
  },
  declineCta: {
    alignItems: 'center',
    backgroundColor: '#B91C1C',
    borderRadius: 10,
    flex: 1,
    padding: 10,
  },
  disabled: {
    opacity: 0.6,
  },
  filterChip: {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: '#BFDBFE',
  },
  filterChipText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formStack: {
    gap: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  listItem: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  listItemSelected: {
    borderColor: '#0C4A6E',
    borderWidth: 2,
  },
  listItemTitle: {
    color: '#0F172A',
    fontWeight: '700',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  panelTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
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
  secondaryCta: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  secondaryCtaText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  serverMessage: {
    color: '#0F172A',
  },
  splitColumn: {
    gap: 12,
  },
  statusText: {
    color: '#0F172A',
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
