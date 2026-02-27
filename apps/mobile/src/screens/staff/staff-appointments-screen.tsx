import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import type { AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { formatAppointmentDateTime } from '../../lib/date-format';
import { ensureValidSession, supabase } from '../../lib/supabase';

type StaffAppointment = {
  id: string;
  title: string;
  description: string | null;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  start_at_utc: string;
  end_at_utc: string;
  status: AppointmentStatus | 'accepted';
  candidate_name: string;
};

type CandidateOption = {
  id: string;
  name: string;
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

function shouldHideExpiredAppointment(appointment: StaffAppointment): boolean {
  if (appointment.status !== 'scheduled' && appointment.status !== 'declined') {
    return false;
  }

  const endTimeMs = Date.parse(appointment.end_at_utc);
  if (!Number.isFinite(endTimeMs)) {
    return false;
  }

  return endTimeMs < Date.now() - APPOINTMENT_HIDE_AFTER_MS;
}

function getStatusLabel(status: AppointmentStatus | 'accepted'): string {
  return status === 'accepted' ? 'scheduled' : status;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  accepted: { bg: '#D1FAE5', text: '#065F46' },
  scheduled: { bg: '#D1FAE5', text: '#065F46' },
  declined: { bg: '#FEE2E2', text: '#991B1B' },
  cancelled: { bg: '#F1F5F9', text: '#64748B' },
};

function useStaffAppointmentsScreen() {
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [candidateSearchText, setCandidateSearchText] = useState('');

  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createStartAtLocal, setCreateStartAtLocal] = useState(() => new Date(Date.now() + 3600_000));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [createDurationMinutes, setCreateDurationMinutes] = useState(30);
  const [createModality, setCreateModality] = useState<'virtual' | 'in_person'>('virtual');
  const [createLocation, setCreateLocation] = useState('');
  const [createVideoUrl, setCreateVideoUrl] = useState('');
  const [creating, setCreating] = useState(false);

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
      const name = Array.isArray(candidate) ? candidate[0]?.name ?? 'Unknown' : candidate?.name ?? 'Unknown';

      return {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string | null,
        modality: row.modality as 'virtual' | 'in_person',
        location_text: row.location_text as string | null,
        video_url: row.video_url as string | null,
        start_at_utc: row.start_at_utc as string,
        end_at_utc: row.end_at_utc as string,
        status: row.status as AppointmentStatus | 'accepted',
        candidate_name: name,
      };
    });

    setAppointments(mapped.filter((appointment) => !shouldHideExpiredAppointment(appointment)));
    setStatusMessage('');
  }, []);

  const loadCandidates = useCallback(async () => {
    const { data, error } = await supabase
      .from('users_profile')
      .select('id,name')
      .eq('role', 'candidate')
      .order('name', { ascending: true });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    const mapped = (data ?? []) as CandidateOption[];
    setCandidates(mapped);
    setSelectedCandidateId((current) => current || mapped[0]?.id || '');
  }, []);

  useEffect(() => {
    void loadAppointments();
    void loadCandidates();
  }, [loadAppointments, loadCandidates]);

  const filteredCandidates = useMemo(() => {
    const search = candidateSearchText.trim().toLowerCase();
    if (!search) {
      return candidates;
    }

    return candidates.filter((candidate) => candidate.name.toLowerCase().includes(search));
  }, [candidateSearchText, candidates]);

  useEffect(() => {
    if (!filteredCandidates.some((candidate) => candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(filteredCandidates[0]?.id ?? '');
    }
  }, [filteredCandidates, selectedCandidateId]);

  const selectedCandidateName =
    candidates.find((candidate) => candidate.id === selectedCandidateId)?.name ?? '';

  const createEndAtLocal = useMemo(
    () => new Date(createStartAtLocal.getTime() + createDurationMinutes * 60_000),
    [createDurationMinutes, createStartAtLocal],
  );

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

        setStatusMessage(decision === 'accepted' ? 'Appointment scheduled.' : 'Appointment declined.');
        await loadAppointments();
      } catch (err) {
        setStatusMessage((err as Error).message);
      } finally {
        setReviewingId(null);
      }
    },
    [loadAppointments],
  );

  const handleCreateAppointment = useCallback(async () => {
    if (!selectedCandidateId) {
      setStatusMessage('Select a candidate before scheduling.');
      return;
    }

    if (!createTitle.trim()) {
      setStatusMessage('Appointment title is required.');
      return;
    }

    setCreating(true);
    setStatusMessage('');

    try {
      await ensureValidSession();
      const { error } = await supabase.functions.invoke('schedule_or_update_appointment', {
        body: {
          candidateUserId: selectedCandidateId,
          title: createTitle.trim(),
          description: createDescription.trim() || undefined,
          modality: createModality,
          locationText: createModality === 'in_person' ? createLocation.trim() || undefined : undefined,
          videoUrl: createModality === 'virtual' ? createVideoUrl.trim() || undefined : undefined,
          startAtUtc: createStartAtLocal.toISOString(),
          endAtUtc: createEndAtLocal.toISOString(),
          timezoneLabel: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
          status: 'scheduled',
        },
      });

      if (error) {
        setStatusMessage(error.message);
        return;
      }

      setStatusMessage('Appointment scheduled.');
      setCreateTitle('');
      setCreateDescription('');
      setCreateStartAtLocal(new Date(Date.now() + 3600_000));
      setCreateDurationMinutes(30);
      setCreateLocation('');
      setCreateVideoUrl('');
      await loadAppointments();
    } catch (err) {
      setStatusMessage((err as Error).message);
    } finally {
      setCreating(false);
    }
  }, [
    createDescription,
    createEndAtLocal,
    createLocation,
    createModality,
    createStartAtLocal,
    createTitle,
    createVideoUrl,
    loadAppointments,
    selectedCandidateId,
  ]);

  const pending = appointments.filter((appointment) => appointment.status === 'pending');
  const others = appointments.filter((appointment) => appointment.status !== 'pending');

  return {
    pending,
    others,
    statusMessage,
    reviewingId,
    handleReview,
    filteredCandidates,
    selectedCandidateId,
    setSelectedCandidateId,
    candidateSearchText,
    setCandidateSearchText,
    selectedCandidateName,
    createTitle,
    setCreateTitle,
    createDescription,
    setCreateDescription,
    createModality,
    setCreateModality,
    createLocation,
    setCreateLocation,
    createVideoUrl,
    setCreateVideoUrl,
    createStartAtLocal,
    createEndAtLocal,
    createDurationMinutes,
    setCreateDurationMinutes,
    showStartPicker,
    setShowStartPicker,
    handleStartPickerChange,
    creating,
    handleCreateAppointment,
  };
}

export function StaffAppointmentsScreen() {
  const {
    pending,
    others,
    statusMessage,
    reviewingId,
    handleReview,
    filteredCandidates,
    selectedCandidateId,
    setSelectedCandidateId,
    candidateSearchText,
    setCandidateSearchText,
    selectedCandidateName,
    createTitle,
    setCreateTitle,
    createDescription,
    setCreateDescription,
    createModality,
    setCreateModality,
    createLocation,
    setCreateLocation,
    createVideoUrl,
    setCreateVideoUrl,
    createStartAtLocal,
    createEndAtLocal,
    createDurationMinutes,
    setCreateDurationMinutes,
    showStartPicker,
    setShowStartPicker,
    handleStartPickerChange,
    creating,
    handleCreateAppointment,
  } = useStaffAppointmentsScreen();

  return (
    <ScreenShell>
      <Text style={styles.title}>Appointment Review</Text>
      <Text style={styles.body}>Review and approve candidate appointment requests.</Text>

      <View style={styles.createCard}>
        <Text style={styles.sectionHeader}>Schedule for Candidate</Text>

        <TextInput
          style={styles.input}
          placeholder="Search candidates"
          value={candidateSearchText}
          onChangeText={setCandidateSearchText}
        />
        <View style={styles.pickerShell}>
          <Picker selectedValue={selectedCandidateId} onValueChange={(value) => setSelectedCandidateId(String(value))}>
            {filteredCandidates.map((candidate) => (
              <Picker.Item key={candidate.id} label={candidate.name} value={candidate.id} />
            ))}
          </Picker>
        </View>
        {selectedCandidateName ? <Text style={styles.helperText}>Selected: {selectedCandidateName}</Text> : null}

        <View style={styles.modalityRow}>
          <Pressable
            style={[styles.modeChip, createModality === 'virtual' ? styles.modeChipSelected : null]}
            onPress={() => setCreateModality('virtual')}
          >
            <Text style={createModality === 'virtual' ? styles.modeChipTextSelected : styles.modeChipText}>Virtual</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, createModality === 'in_person' ? styles.modeChipSelected : null]}
            onPress={() => setCreateModality('in_person')}
          >
            <Text style={createModality === 'in_person' ? styles.modeChipTextSelected : styles.modeChipText}>In-person</Text>
          </Pressable>
        </View>

        <TextInput style={styles.input} placeholder="Title" value={createTitle} onChangeText={setCreateTitle} />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Description (optional)"
          value={createDescription}
          onChangeText={setCreateDescription}
          multiline
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

        <Text style={styles.helperText}>Meeting length</Text>
        <View style={styles.pickerShell}>
          <Picker selectedValue={createDurationMinutes} onValueChange={(value) => setCreateDurationMinutes(Number(value))}>
            {DURATION_OPTIONS.map((option) => (
              <Picker.Item key={option.minutes} label={option.label} value={option.minutes} />
            ))}
          </Picker>
        </View>

        <Text style={styles.helperText}>Ends: {formatAppointmentDateTime(createEndAtLocal.toISOString())}</Text>

        {createModality === 'in_person' ? (
          <TextInput
            style={styles.input}
            placeholder="Location (optional)"
            value={createLocation}
            onChangeText={setCreateLocation}
          />
        ) : null}

        {createModality === 'virtual' ? (
          <TextInput
            style={styles.input}
            placeholder="Video URL (optional)"
            value={createVideoUrl}
            onChangeText={setCreateVideoUrl}
            autoCapitalize="none"
          />
        ) : null}

        <Pressable
          style={[styles.actionButton, styles.acceptButton, creating ? styles.disabledButton : null]}
          onPress={() => void handleCreateAppointment()}
          disabled={creating}
        >
          <Text style={styles.acceptButtonText}>{creating ? 'Scheduling...' : 'Schedule Appointment'}</Text>
        </Pressable>
      </View>

      {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}

      {pending.length > 0 ? (
        <>
          <Text style={styles.sectionHeader}>Pending Approval ({pending.length})</Text>
          {pending.map((appointment) => (
            <View key={appointment.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{appointment.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS.pending.bg }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS.pending.text }]}>Pending</Text>
                </View>
              </View>
              <Text style={styles.cardSubtitle}>{appointment.candidate_name}</Text>
              <Text style={styles.cardTime}>
                {formatAppointmentDateTime(appointment.start_at_utc)} – {formatAppointmentDateTime(appointment.end_at_utc)}
              </Text>
              <Text style={styles.cardDetail}>
                {appointment.modality === 'virtual' ? 'Virtual' : 'In-person'}
                {appointment.location_text ? ` · ${appointment.location_text}` : ''}
              </Text>
              {appointment.description ? <Text style={styles.cardDescription}>{appointment.description}</Text> : null}

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionButton, styles.acceptButton]}
                  onPress={() => handleReview(appointment.id, 'accepted')}
                  disabled={reviewingId === appointment.id}
                >
                  <Text style={styles.acceptButtonText}>{reviewingId === appointment.id ? 'Saving...' : 'Schedule'}</Text>
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
                    <Text style={[styles.statusText, { color: colors.text }]}>{getStatusLabel(appointment.status)}</Text>
                  </View>
                </View>
                <Text style={styles.cardSubtitle}>{appointment.candidate_name}</Text>
                <Text style={styles.cardTime}>
                  {formatAppointmentDateTime(appointment.start_at_utc)} – {formatAppointmentDateTime(appointment.end_at_utc)}
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
  createCard: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  input: {
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  valueText: {
    color: '#0F172A',
  },
  pickerShell: {
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pickerDone: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  pickerDoneText: {
    color: '#166534',
    fontWeight: '700',
  },
  helperText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    borderColor: '#CBD5E1',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modeChipSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  modeChipText: {
    color: '#334155',
    fontWeight: '600',
  },
  modeChipTextSelected: {
    color: '#166534',
    fontWeight: '700',
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
  disabledButton: {
    opacity: 0.7,
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
