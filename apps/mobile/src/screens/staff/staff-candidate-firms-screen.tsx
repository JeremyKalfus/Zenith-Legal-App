import { FIRM_STATUSES, getJdDegreeDateLabel, type FirmStatus } from '@zenith/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { env } from '../../config/env';
import { useAuth } from '../../context/auth-context';
import {
  assignFirmToCandidate,
  listActiveFirms,
  listCandidateAssignments,
  listRecruiterUsers,
  setCandidateAssignedRecruiter,
  type RecruiterUserOption,
  type StaffCandidateAssignmentRow,
  type StaffCandidateListItem,
  type StaffFirmOption,
  unassignFirmFromCandidate,
  updateCandidateAssignmentStatus,
} from '../../features/staff-candidate-management';
import { supabase } from '../../lib/supabase';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';
import { getFirmStatusBadgeColors } from '../../features/firm-status-badge';

type StatusModalState = {
  assignmentId: string;
  firmName: string;
  selectedStatus: FirmStatus;
} | null;

const USER_ONLY_AUTHORIZED_STATUS = 'Authorized, will submit soon' as const;
const STAFF_SETTABLE_FIRM_STATUSES = FIRM_STATUSES.filter(
  (status) => status !== USER_ONLY_AUTHORIZED_STATUS,
) as FirmStatus[];
const BANNER_OVERRIDES_UNAVAILABLE_MESSAGE =
  'Candidate-specific banner overrides are unavailable in this environment. Apply the latest Supabase migration and refresh schema cache.';
const ASSIGNED_RECRUITER_UNAVAILABLE_MESSAGE =
  'Assigned recruiter is unavailable in this environment. Apply the latest Supabase migration and refresh schema cache.';

function isMissingBannerOverrideTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === 'PGRST205' ||
    message.includes("could not find the table 'public.candidate_recruiter_contact_overrides'") ||
    message.includes('candidate_recruiter_contact_overrides')
  );
}

function isMissingAssignedRecruiterTableError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === 'PGRST205' ||
    message.includes("could not find the table 'public.candidate_recruiter_assignments'") ||
    message.includes('candidate_recruiter_assignments')
  );
}

export function StaffCandidateFirmsScreen({
  candidate,
}: {
  candidate: StaffCandidateListItem;
}) {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<StaffCandidateAssignmentRow[]>([]);
  const [firms, setFirms] = useState<StaffFirmOption[]>([]);
  const [firmQuery, setFirmQuery] = useState('');
  const [defaultBannerPhone, setDefaultBannerPhone] = useState(env.supportPhone);
  const [defaultBannerEmail, setDefaultBannerEmail] = useState(env.supportEmail);
  const [bannerPhoneDraft, setBannerPhoneDraft] = useState(env.supportPhone);
  const [bannerEmailDraft, setBannerEmailDraft] = useState(env.supportEmail);
  const [bannerOverridesAvailable, setBannerOverridesAvailable] = useState(true);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [hasBannerOverride, setHasBannerOverride] = useState(false);
  const [assignedRecruiterOptions, setAssignedRecruiterOptions] = useState<RecruiterUserOption[]>([]);
  const [assignedRecruiterAvailable, setAssignedRecruiterAvailable] = useState(true);
  const [assignedRecruiterNotice, setAssignedRecruiterNotice] = useState<string | null>(null);
  const [savedAssignedRecruiterUserId, setSavedAssignedRecruiterUserId] = useState<string | null>(
    candidate.assignedRecruiterUserId ?? null,
  );
  const [selectedAssignedRecruiterUserId, setSelectedAssignedRecruiterUserId] = useState<string>(
    candidate.assignedRecruiterUserId ?? 'none',
  );
  const [showAssignedRecruiterModal, setShowAssignedRecruiterModal] = useState(false);
  const [hasLoadedAssignments, setHasLoadedAssignments] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<StatusModalState>(null);
  const loadInFlightRef = useRef(false);

  const loadData = useCallback(async () => {
    if (loadInFlightRef.current) {
      return;
    }

    loadInFlightRef.current = true;
    try {
      const [assignmentRows, firmRows, recruiterRows, globalContactResult, overrideResult, assignedRecruiterResult] =
        await Promise.all([
        listCandidateAssignments(candidate.id),
        listActiveFirms(),
        listRecruiterUsers(),
        supabase
          .from('recruiter_contact_config')
          .select('phone,email')
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('candidate_recruiter_contact_overrides')
          .select('phone,email')
          .eq('candidate_user_id', candidate.id)
          .maybeSingle(),
        supabase
          .from('candidate_recruiter_assignments')
          .select('recruiter_user_id')
          .eq('candidate_user_id', candidate.id)
          .maybeSingle(),
        ]);

      if (globalContactResult.error) {
        throw new Error(globalContactResult.error.message);
      }
      const isOverrideTableMissing = isMissingBannerOverrideTableError(overrideResult.error);
      if (overrideResult.error && !isOverrideTableMissing) {
        throw new Error(overrideResult.error.message);
      }
      const isAssignedRecruiterTableMissing = isMissingAssignedRecruiterTableError(
        assignedRecruiterResult.error,
      );
      if (assignedRecruiterResult.error && !isAssignedRecruiterTableMissing) {
        throw new Error(assignedRecruiterResult.error.message);
      }

      const globalPhone = globalContactResult.data?.phone?.trim() || env.supportPhone;
      const globalEmail = globalContactResult.data?.email?.trim() || env.supportEmail;
      const overridePhone = isOverrideTableMissing ? null : overrideResult.data?.phone?.trim();
      const overrideEmail = isOverrideTableMissing ? null : overrideResult.data?.email?.trim();
      const assignedRecruiterUserId = isAssignedRecruiterTableMissing
        ? null
        : assignedRecruiterResult.data?.recruiter_user_id ?? null;

      setAssignments(assignmentRows);
      setFirms(firmRows);
      setAssignedRecruiterOptions(recruiterRows);
      setDefaultBannerPhone(globalPhone);
      setDefaultBannerEmail(globalEmail);
      setBannerOverridesAvailable(!isOverrideTableMissing);
      setBannerNotice(isOverrideTableMissing ? BANNER_OVERRIDES_UNAVAILABLE_MESSAGE : null);
      setAssignedRecruiterAvailable(!isAssignedRecruiterTableMissing);
      setAssignedRecruiterNotice(
        isAssignedRecruiterTableMissing ? ASSIGNED_RECRUITER_UNAVAILABLE_MESSAGE : null,
      );
      setSavedAssignedRecruiterUserId(assignedRecruiterUserId);
      setSelectedAssignedRecruiterUserId(assignedRecruiterUserId ?? 'none');
      if (overridePhone && overrideEmail) {
        setBannerPhoneDraft(overridePhone);
        setBannerEmailDraft(overrideEmail);
        setHasBannerOverride(true);
      } else {
        setBannerPhoneDraft(globalPhone);
        setBannerEmailDraft(globalEmail);
        setHasBannerOverride(false);
      }
      setMessage(null);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      loadInFlightRef.current = false;
      setHasLoadedAssignments(true);
    }
  }, [candidate.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      const intervalId = setInterval(() => {
        void loadData();
      }, 30000);

      return () => {
        clearInterval(intervalId);
      };
    }, [loadData]),
  );

  const assignedFirmIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.firm_id)),
    [assignments],
  );

  const filteredAssignableFirms = useMemo(() => {
    const query = firmQuery.trim().toLowerCase();
    return firms.filter((firm) => {
      if (!firm.active || assignedFirmIds.has(firm.id)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return firm.name.toLowerCase().includes(query);
    });
  }, [assignedFirmIds, firmQuery, firms]);

  const assignedRecruiterLabelById = useMemo(
    () =>
      new Map(
        assignedRecruiterOptions.map((option) => [option.id, option.displayName]),
      ),
    [assignedRecruiterOptions],
  );

  const selectedAssignedRecruiterLabel = selectedAssignedRecruiterUserId === 'none'
    ? 'None'
    : assignedRecruiterLabelById.get(selectedAssignedRecruiterUserId) ?? 'None';
  const savedAssignedRecruiterLabel = savedAssignedRecruiterUserId
    ? assignedRecruiterLabelById.get(savedAssignedRecruiterUserId) ?? 'None'
    : 'None';
  const hasAssignedRecruiterChanges =
    (selectedAssignedRecruiterUserId === 'none' ? null : selectedAssignedRecruiterUserId) !==
    savedAssignedRecruiterUserId;

  const handleSaveAssignedRecruiter = useCallback(async () => {
    if (!assignedRecruiterAvailable) {
      setMessage(ASSIGNED_RECRUITER_UNAVAILABLE_MESSAGE);
      return;
    }

    setBusyAction('recruiter:save');
    setMessage(null);
    try {
      const recruiterUserId =
        selectedAssignedRecruiterUserId === 'none' ? null : selectedAssignedRecruiterUserId;
      await setCandidateAssignedRecruiter(candidate.id, recruiterUserId, profile?.id ?? null);
      setMessage('Assigned recruiter updated.');
      await loadData();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyAction(null);
    }
  }, [
    assignedRecruiterAvailable,
    candidate.id,
    loadData,
    profile?.id,
    selectedAssignedRecruiterUserId,
  ]);

  const handleAssign = useCallback(
    async (firm: StaffFirmOption) => {
      setBusyAction(`assign:${firm.id}`);
      setMessage(null);
      try {
        await assignFirmToCandidate(candidate.id, firm.id);
        setMessage(`Assigned ${firm.name}.`);
        await loadData();
      } catch (error) {
        setMessage((error as Error).message);
      } finally {
        setBusyAction(null);
      }
    },
    [candidate.id, loadData],
  );

  const handleSaveStatus = useCallback(async () => {
    if (!statusModal) {
      return;
    }
    if (statusModal.selectedStatus === USER_ONLY_AUTHORIZED_STATUS) {
      setMessage('Only candidates can set "Authorized, will submit soon". Choose the next recruiter status.');
      return;
    }

    setBusyAction(`status:${statusModal.assignmentId}`);
    setMessage(null);
    try {
      await updateCandidateAssignmentStatus(statusModal.assignmentId, statusModal.selectedStatus);
      setStatusModal(null);
      setMessage(`Updated status for ${statusModal.firmName}.`);
      await loadData();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyAction(null);
    }
  }, [loadData, statusModal]);

  const handleUnassign = useCallback(
    (assignment: StaffCandidateAssignmentRow) => {
      Alert.alert(
        'Unassign firm',
        `Remove ${assignment.firm.name} from this candidate?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unassign',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setBusyAction(`unassign:${assignment.id}`);
                setMessage(null);
                try {
                  await unassignFirmFromCandidate(assignment.id);
                  setMessage(`Removed ${assignment.firm.name}.`);
                  await loadData();
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusyAction(null);
                }
              })();
            },
          },
        ],
      );
    },
    [loadData],
  );

  const handleSaveBannerContact = useCallback(async () => {
    if (!bannerOverridesAvailable) {
      setMessage(BANNER_OVERRIDES_UNAVAILABLE_MESSAGE);
      return;
    }

    const phone = bannerPhoneDraft.trim();
    const email = bannerEmailDraft.trim().toLowerCase();
    if (!phone || !email) {
      setMessage('Phone and email are required.');
      return;
    }

    setBusyAction('banner:save');
    setMessage(null);
    try {
      const { error } = await supabase
        .from('candidate_recruiter_contact_overrides')
        .upsert(
          {
            candidate_user_id: candidate.id,
            phone,
            email,
            updated_by: profile?.id ?? null,
          },
          { onConflict: 'candidate_user_id' },
        );

      if (error) {
        if (isMissingBannerOverrideTableError(error)) {
          setBannerOverridesAvailable(false);
          setBannerNotice(BANNER_OVERRIDES_UNAVAILABLE_MESSAGE);
          throw new Error(BANNER_OVERRIDES_UNAVAILABLE_MESSAGE);
        }
        throw new Error(error.message);
      }

      setMessage('Candidate banner override saved.');
      await loadData();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyAction(null);
    }
  }, [bannerEmailDraft, bannerOverridesAvailable, bannerPhoneDraft, candidate.id, loadData, profile?.id]);

  const handleResetBannerContact = useCallback(async () => {
    if (!bannerOverridesAvailable) {
      setMessage(BANNER_OVERRIDES_UNAVAILABLE_MESSAGE);
      return;
    }

    setBusyAction('banner:reset');
    setMessage(null);
    try {
      const { error } = await supabase
        .from('candidate_recruiter_contact_overrides')
        .delete()
        .eq('candidate_user_id', candidate.id);

      if (error) {
        if (isMissingBannerOverrideTableError(error)) {
          setBannerOverridesAvailable(false);
          setBannerNotice(BANNER_OVERRIDES_UNAVAILABLE_MESSAGE);
          throw new Error(BANNER_OVERRIDES_UNAVAILABLE_MESSAGE);
        }
        throw new Error(error.message);
      }

      setMessage('Candidate banner reset to global default.');
      await loadData();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyAction(null);
    }
  }, [bannerOverridesAvailable, candidate.id, loadData]);

  return (
    <ScreenShell showBanner={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerMeta}>
          <Text style={styles.title}>{candidate.name || 'Candidate'}</Text>
          <Text style={styles.subtitle}>{candidate.email}</Text>
          <Text style={styles.subtitle}>{candidate.mobile || 'No mobile on file'}</Text>
          <Text style={styles.subtitle}>
            JD degree date: {getJdDegreeDateLabel(candidate.jdDegreeDate)}
          </Text>
        </View>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assigned Recruiter</Text>
        <View style={styles.bannerCard}>
          <Text style={styles.bannerStatus}>Current: {savedAssignedRecruiterLabel}</Text>
          {assignedRecruiterNotice ? <Text style={styles.bannerNotice}>{assignedRecruiterNotice}</Text> : null}
          <Pressable
            style={styles.selectorButton}
            disabled={!assignedRecruiterAvailable}
            onPress={() => setShowAssignedRecruiterModal(true)}
          >
            <Text style={styles.selectorButtonLabel}>Assigned recruiter</Text>
            <View style={styles.selectorValueRow}>
              <Text style={styles.selectorButtonValue}>{selectedAssignedRecruiterLabel}</Text>
              <Text style={styles.selectorChevron}>⌄</Text>
            </View>
          </Pressable>

          <Pressable
            style={interactivePressableStyle({
              base: styles.primaryButtonSmall,
              disabled:
                busyAction !== null ||
                !assignedRecruiterAvailable ||
                !hasAssignedRecruiterChanges,
              disabledStyle: styles.buttonDisabled,
              hoverStyle: sharedPressableFeedback.hover,
              focusStyle: sharedPressableFeedback.focus,
              pressedStyle: sharedPressableFeedback.pressed,
            })}
            disabled={
              busyAction !== null ||
              !assignedRecruiterAvailable ||
              !hasAssignedRecruiterChanges
            }
            onPress={() => void handleSaveAssignedRecruiter()}
          >
            <Text style={styles.primaryButtonSmallText}>
              {busyAction === 'recruiter:save' ? 'Saving...' : 'Save recruiter'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Candidate Banner Contact</Text>
        <View style={styles.bannerCard}>
          <Text style={styles.bannerStatus}>
            {hasBannerOverride ? 'Override active for this candidate.' : 'Using global default contact.'}
          </Text>
          <Text style={styles.bannerDefaultText}>
            Default: {defaultBannerPhone} • {defaultBannerEmail}
          </Text>
          {bannerNotice ? <Text style={styles.bannerNotice}>{bannerNotice}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder="Banner phone"
            placeholderTextColor={uiColors.textPlaceholder}
            editable={bannerOverridesAvailable}
            value={bannerPhoneDraft}
            onChangeText={setBannerPhoneDraft}
          />
          <TextInput
            style={styles.input}
            placeholder="Banner email"
            placeholderTextColor={uiColors.textPlaceholder}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={bannerOverridesAvailable}
            value={bannerEmailDraft}
            onChangeText={setBannerEmailDraft}
          />
          <View style={styles.rowActions}>
            <Pressable
              style={interactivePressableStyle({
                base: styles.primaryButtonSmall,
                disabled: busyAction !== null || !bannerOverridesAvailable,
                disabledStyle: styles.buttonDisabled,
                hoverStyle: sharedPressableFeedback.hover,
                focusStyle: sharedPressableFeedback.focus,
                pressedStyle: sharedPressableFeedback.pressed,
              })}
              disabled={busyAction !== null || !bannerOverridesAvailable}
              onPress={() => void handleSaveBannerContact()}
            >
              <Text style={styles.primaryButtonSmallText}>
                {busyAction === 'banner:save' ? 'Saving...' : 'Save override'}
              </Text>
            </Pressable>
            <Pressable
              style={interactivePressableStyle({
                base: styles.secondaryButtonSmall,
                disabled: busyAction !== null || !hasBannerOverride || !bannerOverridesAvailable,
                disabledStyle: styles.buttonDisabled,
                hoverStyle: sharedPressableFeedback.hover,
                focusStyle: sharedPressableFeedback.focus,
                pressedStyle: sharedPressableFeedback.pressed,
              })}
              disabled={busyAction !== null || !hasBannerOverride || !bannerOverridesAvailable}
              onPress={() => void handleResetBannerContact()}
            >
              <Text style={styles.secondaryButtonSmallText}>
                {busyAction === 'banner:reset' ? 'Resetting...' : 'Reset to default'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assigned Firms</Text>
        {assignments.length === 0 && hasLoadedAssignments ? (
          <Text style={styles.emptyText}>No firms assigned yet.</Text>
        ) : (
          assignments.map((assignment) => {
            const rowBusy =
              busyAction === `status:${assignment.id}` ||
              busyAction === `unassign:${assignment.id}`;
            const statusBadgeColors = getFirmStatusBadgeColors(assignment.status_enum);

            return (
              <View key={assignment.id} style={styles.card}>
                <Text style={styles.cardTitle}>{assignment.firm.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statusBadgeColors.backgroundColor,
                      borderColor: statusBadgeColors.borderColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: statusBadgeColors.textColor,
                      },
                    ]}
                  >
                    {assignment.status_enum}
                  </Text>
                </View>
                <Text style={styles.cardSubtle}>
                  Updated {new Date(assignment.status_updated_at).toLocaleString()}
                </Text>

                <View style={styles.rowActions}>
                  <Pressable
                    style={interactivePressableStyle({
                      base: styles.primaryButtonSmall,
                      disabled: rowBusy || !!busyAction?.startsWith('assign:'),
                      disabledStyle: styles.buttonDisabled,
                      hoverStyle: sharedPressableFeedback.hover,
                      focusStyle: sharedPressableFeedback.focus,
                      pressedStyle: sharedPressableFeedback.pressed,
                    })}
                    disabled={rowBusy || busyAction?.startsWith('assign:')}
                    onPress={() =>
                      setStatusModal({
                        assignmentId: assignment.id,
                        firmName: assignment.firm.name,
                        selectedStatus: assignment.status_enum,
                      })
                    }
                  >
                    <Text style={styles.primaryButtonSmallText}>
                      {busyAction === `status:${assignment.id}` ? 'Saving...' : 'Change status'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={interactivePressableStyle({
                      base: styles.dangerButtonSmall,
                      disabled: rowBusy || !!busyAction?.startsWith('assign:'),
                      disabledStyle: styles.buttonDisabled,
                      hoverStyle: sharedPressableFeedback.hover,
                      focusStyle: sharedPressableFeedback.focus,
                      pressedStyle: sharedPressableFeedback.pressed,
                    })}
                    disabled={rowBusy || busyAction?.startsWith('assign:')}
                    onPress={() => handleUnassign(assignment)}
                  >
                    <Text style={styles.dangerButtonSmallText}>
                      {busyAction === `unassign:${assignment.id}` ? 'Removing...' : 'Unassign'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assign Active Firms</Text>
        <TextInput
          style={styles.input}
          placeholder="Filter firms"
          placeholderTextColor={uiColors.textPlaceholder}
          value={firmQuery}
          onChangeText={setFirmQuery}
        />
        {filteredAssignableFirms.length === 0 ? (
          <Text style={styles.emptyText}>No matching assignable firms.</Text>
        ) : (
          filteredAssignableFirms.slice(0, 20).map((firm) => (
            <View key={firm.id} style={styles.assignRow}>
              <Text style={styles.assignFirmName}>{firm.name}</Text>
              <Pressable
                style={interactivePressableStyle({
                  base: styles.primaryButtonSmall,
                  disabled: busyAction !== null,
                  disabledStyle: styles.buttonDisabled,
                  hoverStyle: sharedPressableFeedback.hover,
                  focusStyle: sharedPressableFeedback.focus,
                  pressedStyle: sharedPressableFeedback.pressed,
                })}
                disabled={busyAction !== null}
                onPress={() => void handleAssign(firm)}
              >
                <Text style={styles.primaryButtonSmallText}>
                  {busyAction === `assign:${firm.id}` ? 'Assigning...' : 'Assign'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <Modal
        visible={showAssignedRecruiterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAssignedRecruiterModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assigned Recruiter</Text>
            <Text style={styles.modalSubtitle}>Choose one recruiter for this candidate.</Text>
            <View style={styles.statusOptionList}>
              <Pressable
                style={[
                  styles.statusOption,
                  selectedAssignedRecruiterUserId === 'none' && styles.statusOptionSelected,
                ]}
                onPress={() => setSelectedAssignedRecruiterUserId('none')}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    selectedAssignedRecruiterUserId === 'none' && styles.statusOptionTextSelected,
                  ]}
                >
                  None
                </Text>
              </Pressable>
              {assignedRecruiterOptions.map((option) => {
                const selected = selectedAssignedRecruiterUserId === option.id;
                return (
                  <Pressable
                    key={option.id}
                    style={[styles.statusOption, selected && styles.statusOptionSelected]}
                    onPress={() => setSelectedAssignedRecruiterUserId(option.id)}
                  >
                    <Text style={[styles.statusOptionText, selected && styles.statusOptionTextSelected]}>
                      {option.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.secondaryButtonModal}
                disabled={busyAction === 'recruiter:save'}
                onPress={() => setShowAssignedRecruiterModal(false)}
              >
                <Text style={styles.secondaryButtonModalText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!statusModal}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Status</Text>
            <Text style={styles.modalSubtitle}>{statusModal?.firmName ?? ''}</Text>
            {statusModal?.selectedStatus === USER_ONLY_AUTHORIZED_STATUS ? (
              <Text style={styles.modalHelper}>
                Candidate-only status. Select a recruiter status to continue.
              </Text>
            ) : null}
            <View style={styles.statusOptionList}>
              {STAFF_SETTABLE_FIRM_STATUSES.map((status) => {
                const selected = statusModal?.selectedStatus === status;
                return (
                  <Pressable
                    key={status}
                    style={[styles.statusOption, selected && styles.statusOptionSelected]}
                    onPress={() =>
                      setStatusModal((current) =>
                        current ? { ...current, selectedStatus: status } : current,
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        selected && styles.statusOptionTextSelected,
                      ]}
                    >
                      {status}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.secondaryButtonModal}
                disabled={busyAction?.startsWith('status:')}
                onPress={() => setStatusModal(null)}
              >
                <Text style={styles.secondaryButtonModalText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={interactivePressableStyle({
                  base: styles.primaryButtonModal,
                  disabled:
                    !statusModal ||
                    statusModal.selectedStatus === USER_ONLY_AUTHORIZED_STATUS ||
                    !!busyAction?.startsWith('status:'),
                  hoverStyle: sharedPressableFeedback.hover,
                  focusStyle: sharedPressableFeedback.focus,
                  pressedStyle: sharedPressableFeedback.pressed,
                })}
                disabled={
                  !statusModal ||
                  statusModal.selectedStatus === USER_ONLY_AUTHORIZED_STATUS ||
                  !!busyAction?.startsWith('status:')
                }
                onPress={() => void handleSaveStatus()}
              >
                <Text style={styles.primaryButtonModalText}>
                  {busyAction?.startsWith('status:') ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  assignFirmName: {
    color: uiColors.textPrimary,
    flex: 1,
    flexShrink: 1,
    fontWeight: '600',
    minWidth: 0,
    paddingRight: 8,
  },
  assignRow: {
    alignItems: 'center',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    padding: 10,
  },
  body: {
    color: uiColors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardSubtle: {
    color: uiColors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  cardTitle: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  bannerCard: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  bannerDefaultText: {
    color: uiColors.textMuted,
    fontSize: 12,
  },
  bannerNotice: {
    color: uiColors.warning,
    fontSize: 12,
  },
  bannerStatus: {
    color: uiColors.textStrong,
    fontWeight: '600',
  },
  dangerButtonSmall: {
    alignItems: 'center',
    backgroundColor: uiColors.errorBackground,
    borderColor: uiColors.errorBorder,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dangerButtonSmallText: {
    color: uiColors.errorDark,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: uiColors.textMuted,
    paddingVertical: 4,
  },
  input: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: uiColors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  message: {
    color: uiColors.textStrong,
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: uiColors.modalOverlay,
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: uiColors.surface,
    borderRadius: 14,
    padding: 16,
    width: '100%',
  },
  modalHelper: {
    color: uiColors.warning,
    fontSize: 12,
  },
  modalSubtitle: {
    color: uiColors.textSecondary,
    marginTop: 2,
  },
  modalTitle: {
    color: uiColors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  primaryButtonModal: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    flex: 1,
    minWidth: 140,
    padding: 12,
  },
  primaryButtonModalText: {
    color: uiColors.primaryText,
    fontWeight: '700',
  },
  primaryButtonSmall: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 8,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  primaryButtonSmallText: {
    color: uiColors.primaryText,
    fontWeight: '700',
    textAlign: 'center',
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  headerMeta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonModal: {
    alignItems: 'center',
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minWidth: 140,
    padding: 12,
  },
  secondaryButtonModalText: {
    color: uiColors.textPrimary,
    fontWeight: '600',
  },
  selectorButton: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectorButtonLabel: {
    color: uiColors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  selectorButtonValue: {
    color: uiColors.textPrimary,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  selectorChevron: {
    color: uiColors.textMuted,
    fontSize: 20,
    marginLeft: 8,
    marginTop: -4,
  },
  selectorValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  secondaryButtonSmall: {
    alignItems: 'center',
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryButtonSmallText: {
    color: uiColors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusOption: {
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  statusOptionList: {
    gap: 8,
    marginTop: 12,
  },
  statusOptionSelected: {
    backgroundColor: uiColors.statusSelectedBackground,
    borderColor: uiColors.statusSelectedBorder,
  },
  statusOptionText: {
    color: uiColors.textPrimary,
    fontSize: 13,
  },
  statusOptionTextSelected: {
    color: uiColors.statusSelectedText,
    fontWeight: '700',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  subtitle: {
    color: uiColors.textSecondary,
  },
  title: {
    color: uiColors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
});
