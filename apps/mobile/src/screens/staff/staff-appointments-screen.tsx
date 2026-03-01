import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { useAuth } from '../../context/auth-context';
import { ensureValidSession, supabase } from '../../lib/supabase';
import {
  mapToDeviceCalendarAppointment,
  shouldHideExpiredAppointment,
} from '../../lib/appointments-shared';
import { useAppointmentComposer } from '../../lib/use-appointment-composer';
import { useCalendarSyncEnabled } from '../../lib/use-calendar-sync-enabled';
import { useAppointmentCalendarSync } from '../../lib/use-appointment-calendar-sync';
import { getFunctionErrorMessage } from '../../lib/function-error';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';
import { appointmentSharedStyles } from '../shared/appointment-shared-styles';
import { AppointmentCardDetails } from '../shared/appointment-card-details';
import { AppointmentTimingControls } from '../shared/appointment-timing-controls';

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
  timezone_label: string;
  candidate_name: string;
};

type CandidateOption = {
  id: string;
  name: string;
};

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
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const calendarSyncEnabled = useCalendarSyncEnabled(session?.user.id);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [candidateSearchText, setCandidateSearchText] = useState('');

  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
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
  const [showForm, setShowForm] = useState(false);
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
        'id,title,description,modality,location_text,video_url,start_at_utc,end_at_utc,status,timezone_label,candidate:users_profile!appointments_candidate_user_id_fkey(name)',
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
        timezone_label: (row.timezone_label as string | null) ?? 'America/New_York',
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

  const toDeviceCalendarAppointment = useCallback(
    (appointment: StaffAppointment) =>
      mapToDeviceCalendarAppointment(appointment, appointment.candidate_name),
    [],
  );
  useAppointmentCalendarSync({
    appointments,
    calendarSyncEnabled,
    userId: session?.user.id,
    toDeviceCalendarAppointment,
  });

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

  const toggleForm = useCallback(() => {
    setShowForm((value) => {
      const next = !value;
      if (!next) {
        resetComposer();
      }
      return next;
    });
  }, [resetComposer]);

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
          setStatusMessage(await getFunctionErrorMessage(error));
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
      setShowForm(false);
      setCreateTitle('');
      setCreateDescription('');
      resetComposer();
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
    resetComposer,
    selectedCandidateId,
  ]);

  const pending = appointments.filter((appointment) => appointment.status === 'pending');
  const others = appointments.filter((appointment) => appointment.status !== 'pending');

  return {
    pending,
    others,
    showForm,
    toggleForm,
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
    showDurationPicker,
    setShowDurationPicker,
    selectedDurationLabel,
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
    showForm,
    toggleForm,
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
    showDurationPicker,
    setShowDurationPicker,
    selectedDurationLabel,
    showStartPicker,
    setShowStartPicker,
    handleStartPickerChange,
    creating,
    handleCreateAppointment,
  } = useStaffAppointmentsScreen();

  return (
    <ScreenShell showBanner={false}>
      <Text style={styles.title}>Appointment Review</Text>
      <Text style={styles.body}>Review and approve candidate appointment requests.</Text>

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
          {showForm ? 'Close form' : 'Schedule for candidate'}
        </Text>
      </Pressable>

      {showForm ? (
        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="Search candidates"
            value={candidateSearchText}
            onChangeText={setCandidateSearchText}
          />
          <View style={styles.searchResults}>
            {filteredCandidates.length > 0 ? (
              filteredCandidates.map((candidate) => {
                const isSelected = candidate.id === selectedCandidateId;
                return (
                  <Pressable
                    key={candidate.id}
                    style={[styles.searchResultItem, isSelected ? styles.searchResultItemSelected : null]}
                    onPress={() => setSelectedCandidateId(candidate.id)}
                  >
                    <Text style={isSelected ? styles.searchResultTextSelected : styles.searchResultText}>
                      {candidate.name}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.searchEmptyText}>No candidates match your search.</Text>
            )}
          </View>
          {selectedCandidateName ? <Text style={styles.helperText}>Selected: {selectedCandidateName}</Text> : null}

        <TextInput style={styles.input} placeholder="Title" value={createTitle} onChangeText={setCreateTitle} />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Description (optional)"
          value={createDescription}
          onChangeText={setCreateDescription}
          multiline
        />

        <View style={styles.row}>
          <Pressable
            style={[styles.tag, createModality === 'virtual' ? styles.tagSelected : null]}
            onPress={() => setCreateModality('virtual')}
          >
            <Text>Virtual</Text>
          </Pressable>
          <Pressable
            style={[styles.tag, createModality === 'in_person' ? styles.tagSelected : null]}
            onPress={() => setCreateModality('in_person')}
          >
            <Text>In-person</Text>
          </Pressable>
        </View>

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
          style={interactivePressableStyle({
            base: styles.primaryCta,
            disabled: creating,
            disabledStyle: styles.primaryCtaDisabled,
            hoverStyle: sharedPressableFeedback.hover,
            focusStyle: sharedPressableFeedback.focus,
            pressedStyle: sharedPressableFeedback.pressed,
          })}
          onPress={() => void handleCreateAppointment()}
          disabled={creating}
        >
          <Text style={styles.primaryCtaText}>{creating ? 'Scheduling...' : 'Schedule appointment'}</Text>
        </Pressable>
      </View>
      ) : null}

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
              <AppointmentCardDetails
                description={appointment.description}
                endAtUtc={appointment.end_at_utc}
                locationText={appointment.location_text}
                modality={appointment.modality}
                startAtUtc={appointment.start_at_utc}
                styles={styles}
              />

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
          })}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  ...appointmentSharedStyles,
  input: {
    ...appointmentSharedStyles.input,
    color: uiColors.textPrimary,
  },
  searchResults: {
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 200,
    overflow: 'hidden',
  },
  searchResultItem: {
    borderBottomColor: uiColors.border,
    borderBottomWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  searchResultItemSelected: {
    backgroundColor: uiColors.selectedBackground,
  },
  searchResultText: {
    color: uiColors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  searchResultTextSelected: {
    color: uiColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  searchEmptyText: {
    color: uiColors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  sectionHeader: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  statusMessage: {
    backgroundColor: uiColors.backgroundAlt,
    borderRadius: 8,
    color: uiColors.textPrimary,
    fontSize: 14,
    padding: 10,
  },
  cardTitle: {
    ...appointmentSharedStyles.cardTitle,
  },
  cardSubtitle: {
    color: uiColors.textStrong,
    fontSize: 13,
    fontWeight: '500',
  },
  statusText: {
    ...appointmentSharedStyles.statusText,
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
    backgroundColor: uiColors.successButton,
  },
  acceptButtonText: {
    color: uiColors.primaryText,
    fontWeight: '700',
  },
  declineButton: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.errorBright,
    borderWidth: 1,
  },
  declineButtonText: {
    color: uiColors.errorBright,
    fontWeight: '700',
  },
});
