import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { formatAppointmentDateTime } from '../../lib/date-format';
import { supabase, ensureValidSession } from '../../lib/supabase';

type StaffAppointment = {
  id: string;
  title: string;
  description: string | null;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  start_at_utc: string;
  end_at_utc: string;
  status: AppointmentStatus;
  candidate_name: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  accepted: { bg: '#D1FAE5', text: '#065F46' },
  declined: { bg: '#FEE2E2', text: '#991B1B' },
  cancelled: { bg: '#F1F5F9', text: '#64748B' },
  scheduled: { bg: '#DBEAFE', text: '#1E40AF' },
};

function useStaffAppointmentsScreen() {
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select(
        'id,title,description,modality,location_text,video_url,start_at_utc,end_at_utc,status,candidate:users_profile!appointments_candidate_user_id_fkey(name)',
      )
      .order('start_at_utc', { ascending: true });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    const mapped: StaffAppointment[] = (data ?? []).map((row: Record<string, unknown>) => {
      const candidate = row.candidate as { name: string } | { name: string }[] | null;
      const name = Array.isArray(candidate)
        ? candidate[0]?.name ?? 'Unknown'
        : candidate?.name ?? 'Unknown';

      return {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string | null,
        modality: row.modality as 'virtual' | 'in_person',
        location_text: row.location_text as string | null,
        video_url: row.video_url as string | null,
        start_at_utc: row.start_at_utc as string,
        end_at_utc: row.end_at_utc as string,
        status: row.status as AppointmentStatus,
        candidate_name: name,
      };
    });

    setAppointments(mapped);
    setStatusMessage('');
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const handleReview = useCallback(
    async (appointmentId: string, decision: 'accepted' | 'declined') => {
      setReviewingId(appointmentId);
      setStatusMessage('');

      try {
        await ensureValidSession();

        const { error } = await supabase.functions.invoke('staff_review_appointment', {
          body: { appointment_id: appointmentId, decision },
        });

        if (error) {
          setStatusMessage(error.message);
          return;
        }

        setStatusMessage(`Appointment ${decision}.`);
        await loadAppointments();
      } catch (err) {
        setStatusMessage((err as Error).message);
      } finally {
        setReviewingId(null);
      }
    },
    [loadAppointments],
  );

  const pending = appointments.filter((a) => a.status === 'pending');
  const others = appointments.filter((a) => a.status !== 'pending');

  return { pending, others, statusMessage, reviewingId, handleReview };
}

export function StaffAppointmentsScreen() {
  const { pending, others, statusMessage, reviewingId, handleReview } =
    useStaffAppointmentsScreen();

  return (
    <ScreenShell>
      <Text style={styles.title}>Appointment Review</Text>
      <Text style={styles.body}>Review and approve candidate appointment requests.</Text>

      {statusMessage ? (
        <Text style={styles.statusMessage}>{statusMessage}</Text>
      ) : null}

      {pending.length > 0 ? (
        <>
          <Text style={styles.sectionHeader}>Pending Approval ({pending.length})</Text>
          {pending.map((appointment) => (
            <View key={appointment.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{appointment.title}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: STATUS_COLORS.pending.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: STATUS_COLORS.pending.text },
                    ]}
                  >
                    Pending
                  </Text>
                </View>
              </View>
              <Text style={styles.cardSubtitle}>{appointment.candidate_name}</Text>
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

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionButton, styles.acceptButton]}
                  onPress={() => handleReview(appointment.id, 'accepted')}
                  disabled={reviewingId === appointment.id}
                >
                  <Text style={styles.acceptButtonText}>
                    {reviewingId === appointment.id ? 'Saving...' : 'Accept'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.declineButton]}
                  onPress={() => handleReview(appointment.id, 'declined')}
                  disabled={reviewingId === appointment.id}
                >
                  <Text style={styles.declineButtonText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.emptyState}>No pending appointment requests.</Text>
      )}

      {others.length > 0 ? (
        <>
          <Text style={styles.sectionHeader}>All Appointments ({others.length})</Text>
          {others.map((appointment) => {
            const colors = STATUS_COLORS[appointment.status] ?? STATUS_COLORS.scheduled;
            return (
              <View key={appointment.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{appointment.title}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>
                      {appointment.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardSubtitle}>{appointment.candidate_name}</Text>
                <Text style={styles.cardTime}>
                  {formatAppointmentDateTime(appointment.start_at_utc)} –{' '}
                  {formatAppointmentDateTime(appointment.end_at_utc)}
                </Text>
                <Text style={styles.cardDetail}>
                  {appointment.modality === 'virtual' ? 'Virtual' : 'In-person'}
                  {appointment.location_text ? ` · ${appointment.location_text}` : ''}
                </Text>
              </View>
            );
          })}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    color: '#475569',
  },
  sectionHeader: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyState: {
    color: '#94A3B8',
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
  },
  statusMessage: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    color: '#0F172A',
    fontSize: 14,
    padding: 10,
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
  cardSubtitle: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '500',
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
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    padding: 10,
  },
  acceptButton: {
    backgroundColor: '#059669',
  },
  acceptButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  declineButton: {
    backgroundColor: '#ffffff',
    borderColor: '#DC2626',
    borderWidth: 1,
  },
  declineButtonText: {
    color: '#DC2626',
    fontWeight: '700',
  },
});
