import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { bucketStaffAppointments, type AppointmentStatus } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { StaffPageTitle } from '../../components/staff-page-title';
import { useAuth } from '../../context/auth-context';
import { ensureValidSession, supabase } from '../../lib/supabase';
import {
  mapToDeviceCalendarAppointment,
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
  status: AppointmentStatus;
  timezone_label: string;
  candidate_name: string;
  candidate_user_id: string;
  created_by_user_id: string;
};

type CandidateOption = {
  id: string;
  name: string;
};

type AppointmentAction = 'ignore_overdue' | 'cancel_outgoing_request' | 'cancel_upcoming';

function useStaffAppointmentsScreen() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const calendarSyncEnabled = useCalendarSyncEnabled(session?.user.id);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [candidateSearchText, setCandidateSearchText] = useState('');

  const [createNote, setCreateNote] = useState('');
  const {
    createStartAtLocal,
    handleDatePickerChange,
    handleTimePickerChange,
    resetComposer,
    setCreateStartAtLocal,
    setShowDatePicker,
    setShowTimePicker,
    showDatePicker,
    showTimePicker,
  } = useAppointmentComposer();
  const [showForm, setShowForm] = useState(false);
  const [createModality, setCreateModality] = useState<'virtual' | 'in_person'>('virtual');
  const [createLocation, setCreateLocation] = useState('');
  const [createVideoUrl, setCreateVideoUrl] = useState('');
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [statusMessage, setStatusMessage] = useState('');
  const [actingAppointmentId, setActingAppointmentId] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select(
        'id,title,description,modality,location_text,video_url,start_at_utc,end_at_utc,status,timezone_label,candidate_user_id,created_by_user_id,candidate:users_profile!appointments_candidate_user_id_fkey(name)',
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
        status: row.status as AppointmentStatus,
        timezone_label: (row.timezone_label as string | null) ?? 'America/New_York',
        candidate_name: name,
        candidate_user_id: row.candidate_user_id as string,
        created_by_user_id: row.created_by_user_id as string,
      };
    });

    setAppointments(mapped);
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

    const channel = supabase
      .channel('staff-appointments-realtime')
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

  const sections = useMemo(() => bucketStaffAppointments(appointments), [appointments]);

  const resetFormState = useCallback(() => {
    setCreateNote('');
    setCreateModality('virtual');
    setCreateLocation('');
    setCreateVideoUrl('');
    setEditingAppointmentId(null);
    resetComposer();
  }, [resetComposer]);

  const toggleForm = useCallback(() => {
    setShowForm((value) => {
      const next = !value;
      if (!next) {
        resetFormState();
      }
      return next;
    });
  }, [resetFormState]);

  const runLifecycleAction = useCallback(
    async (appointmentId: string, action: AppointmentAction, successMessage: string) => {
      try {
        setActingAppointmentId(appointmentId);
        setStatusMessage('');
        await ensureValidSession();

        const { error } = await supabase.functions.invoke('manage_appointment_lifecycle', {
          body: {
            appointment_id: appointmentId,
            action,
          },
        });

        if (error) {
          setStatusMessage(await getFunctionErrorMessage(error));
          return;
        }

        setStatusMessage(successMessage);
        await loadAppointments();
      } catch (err) {
        setStatusMessage((err as Error).message);
      } finally {
        setActingAppointmentId(null);
      }
    },
    [loadAppointments],
  );

  const handleSubmitAppointment = useCallback(async () => {
    if (!selectedCandidateId) {
      setStatusMessage('Select a candidate before scheduling.');
      return;
    }

    setCreating(true);
    setStatusMessage('');

    try {
      await ensureValidSession();
      const { error } = await supabase.functions.invoke('schedule_or_update_appointment', {
        body: {
          id: editingAppointmentId ?? undefined,
          candidateUserId: selectedCandidateId,
          modality: createModality,
          locationText: createModality === 'in_person' ? createLocation.trim() || undefined : undefined,
          videoUrl: createModality === 'virtual' ? createVideoUrl.trim() || undefined : undefined,
          note: createNote.trim() || undefined,
          startAtUtc: createStartAtLocal.toISOString(),
          timezoneLabel: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
          status: 'scheduled',
        },
      });

      if (error) {
        setStatusMessage(await getFunctionErrorMessage(error));
        return;
      }

      setStatusMessage(editingAppointmentId ? 'Appointment updated.' : 'Appointment scheduled.');
      setShowForm(false);
      resetFormState();
      await loadAppointments();
    } catch (err) {
      setStatusMessage((err as Error).message);
    } finally {
      setCreating(false);
    }
  }, [
    createLocation,
    createModality,
    createNote,
    createStartAtLocal,
    createVideoUrl,
    editingAppointmentId,
    loadAppointments,
    resetFormState,
    selectedCandidateId,
  ]);

  const startEditAppointment = useCallback((appointment: StaffAppointment) => {
    setEditingAppointmentId(appointment.id);
    setShowForm(true);
    setSelectedCandidateId(appointment.candidate_user_id);
    setCreateNote(appointment.description ?? '');
    setCreateModality(appointment.modality);
    setCreateLocation(appointment.location_text ?? '');
    setCreateVideoUrl(appointment.video_url ?? '');
    setCreateStartAtLocal(new Date(appointment.start_at_utc));
  }, [setCreateStartAtLocal]);

  return {
    sections,
    showForm,
    setShowForm,
    toggleForm,
    statusMessage,
    actingAppointmentId,
    runLifecycleAction,
    filteredCandidates,
    selectedCandidateId,
    setSelectedCandidateId,
    candidateSearchText,
    setCandidateSearchText,
    selectedCandidateName,
    createNote,
    setCreateNote,
    createModality,
    setCreateModality,
    createLocation,
    setCreateLocation,
    createVideoUrl,
    setCreateVideoUrl,
    createStartAtLocal,
    showDatePicker,
    setShowDatePicker,
    showTimePicker,
    setShowTimePicker,
    handleDatePickerChange,
    handleTimePickerChange,
    creating,
    editingAppointmentId,
    handleSubmitAppointment,
    startEditAppointment,
    resetFormState,
  };
}

export function StaffAppointmentsScreen() {
  const {
    sections,
    showForm,
    toggleForm,
    statusMessage,
    actingAppointmentId,
    runLifecycleAction,
    filteredCandidates,
    selectedCandidateId,
    setSelectedCandidateId,
    candidateSearchText,
    setCandidateSearchText,
    selectedCandidateName,
    createNote,
    setCreateNote,
    createModality,
    setCreateModality,
    createLocation,
    setCreateLocation,
    createVideoUrl,
    setCreateVideoUrl,
    createStartAtLocal,
    showDatePicker,
    setShowDatePicker,
    showTimePicker,
    setShowTimePicker,
    handleDatePickerChange,
    handleTimePickerChange,
    creating,
    editingAppointmentId,
    handleSubmitAppointment,
    startEditAppointment,
  } = useStaffAppointmentsScreen();

  const hasSections =
    sections.overdueConfirmed.length > 0 ||
    sections.upcomingAppointments.length > 0;

  return (
    <ScreenShell showBanner={false}>
      <StaffPageTitle title="Appointment Review" />
      <Text style={styles.body}>Review and manage candidate appointments and schedules.</Text>

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
          {showForm
            ? 'Close form'
            : editingAppointmentId
              ? 'Modify appointment'
              : 'Schedule for candidate'}
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
            createStartAtLocal={createStartAtLocal}
            handleDatePickerChange={handleDatePickerChange}
            handleTimePickerChange={handleTimePickerChange}
            setShowDatePicker={setShowDatePicker}
            setShowTimePicker={setShowTimePicker}
            showDatePicker={showDatePicker}
            showTimePicker={showTimePicker}
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

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Note (optional)"
            value={createNote}
            onChangeText={setCreateNote}
            multiline
          />

          <Pressable
            style={interactivePressableStyle({
              base: styles.primaryCta,
              disabled: creating,
              disabledStyle: styles.primaryCtaDisabled,
              hoverStyle: sharedPressableFeedback.hover,
              focusStyle: sharedPressableFeedback.focus,
              pressedStyle: sharedPressableFeedback.pressed,
            })}
            onPress={() => void handleSubmitAppointment()}
            disabled={creating}
          >
            <Text style={styles.primaryCtaText}>
              {creating ? 'Saving...' : editingAppointmentId ? 'Save changes' : 'Schedule appointment'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}

      {sections.overdueConfirmed.length > 0 ? (
        <>
          <Text style={styles.sectionHeader}>Overdue ({sections.overdueConfirmed.length})</Text>
          {sections.overdueConfirmed.map((appointment) => (
            <View key={appointment.id} style={[styles.card, styles.overdueCard]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{appointment.candidate_name}</Text>
                <View style={[styles.statusBadge, styles.overdueBadge]}>
                  <Text style={[styles.statusText, styles.overdueStatusText]}>Overdue</Text>
                </View>
              </View>
              <AppointmentCardDetails
                description={appointment.description}
                locationText={appointment.location_text}
                modality={appointment.modality}
                startAtUtc={appointment.start_at_utc}
                styles={styles}
                timezoneLabel={appointment.timezone_label}
                videoUrl={appointment.video_url}
              />
              <Pressable
                style={interactivePressableStyle({
                  base: styles.secondaryAction,
                  disabled: actingAppointmentId === appointment.id,
                  disabledStyle: styles.primaryCtaDisabled,
                  hoverStyle: sharedPressableFeedback.hover,
                  focusStyle: sharedPressableFeedback.focus,
                  pressedStyle: sharedPressableFeedback.pressed,
                })}
                onPress={() =>
                  void runLifecycleAction(appointment.id, 'ignore_overdue', 'Overdue appointment ignored.')
                }
                disabled={actingAppointmentId === appointment.id}
              >
                <Text style={styles.secondaryActionText}>
                  {actingAppointmentId === appointment.id ? 'Ignoring...' : 'Ignore'}
                </Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}

      {sections.upcomingAppointments.length > 0 ? (
        <>
          <Text style={styles.sectionHeader}>Upcoming Appointments ({sections.upcomingAppointments.length})</Text>
          {sections.upcomingAppointments.map((appointment) => (
            <View key={appointment.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{appointment.candidate_name}</Text>
                <View style={[styles.statusBadge, styles.upcomingBadge]}>
                  <Text style={[styles.statusText, styles.upcomingBadgeText]}>Scheduled</Text>
                </View>
              </View>
              <AppointmentCardDetails
                description={appointment.description}
                locationText={appointment.location_text}
                modality={appointment.modality}
                startAtUtc={appointment.start_at_utc}
                styles={styles}
                timezoneLabel={appointment.timezone_label}
                videoUrl={appointment.video_url}
              />
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionButton, styles.modifyButton]}
                  onPress={() => startEditAppointment(appointment)}
                  disabled={actingAppointmentId === appointment.id}
                >
                  <Text style={styles.modifyButtonText}>Modify</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.declineButton]}
                  onPress={() =>
                    void runLifecycleAction(appointment.id, 'cancel_upcoming', 'Upcoming appointment canceled.')
                  }
                  disabled={actingAppointmentId === appointment.id}
                >
                  <Text style={styles.declineButtonText}>
                    {actingAppointmentId === appointment.id ? 'Canceling...' : 'Cancel'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {!hasSections ? <Text style={styles.emptyState}>No appointments in these sections.</Text> : null}
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
  overdueCard: {
    borderColor: uiColors.errorBright,
    borderWidth: 1,
  },
  overdueBadge: {
    backgroundColor: '#FEE2E2',
  },
  overdueStatusText: {
    color: '#991B1B',
  },
  upcomingBadge: {
    backgroundColor: uiColors.surface,
  },
  upcomingBadgeText: {
    color: uiColors.textSecondary,
  },
  cardTitle: {
    ...appointmentSharedStyles.cardTitle,
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
  modifyButton: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderWidth: 1,
  },
  modifyButtonText: {
    color: uiColors.textPrimary,
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
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: uiColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
