import { FIRM_STATUSES, type FirmStatus } from '@zenith/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  assignFirmToCandidate,
  listActiveFirms,
  listCandidateAssignments,
  type StaffCandidateAssignmentRow,
  type StaffCandidateListItem,
  type StaffFirmOption,
  unassignFirmFromCandidate,
  updateCandidateAssignmentStatus,
} from '../../features/staff-candidate-management';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';

type StatusModalState = {
  assignmentId: string;
  firmName: string;
  selectedStatus: FirmStatus;
} | null;

const USER_ONLY_AUTHORIZED_STATUS = 'Authorized, will submit soon' as const;
const STAFF_SETTABLE_FIRM_STATUSES = FIRM_STATUSES.filter(
  (status) => status !== USER_ONLY_AUTHORIZED_STATUS,
) as FirmStatus[];

export function StaffCandidateFirmsScreen({
  candidate,
}: {
  candidate: StaffCandidateListItem;
}) {
  const [assignments, setAssignments] = useState<StaffCandidateAssignmentRow[]>([]);
  const [firms, setFirms] = useState<StaffFirmOption[]>([]);
  const [firmQuery, setFirmQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<StatusModalState>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [assignmentRows, firmRows] = await Promise.all([
        listCandidateAssignments(candidate.id),
        listActiveFirms(),
      ]);
      setAssignments(assignmentRows);
      setFirms(firmRows);
      setMessage(null);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [candidate.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      setMessage('Only candidates can set "Authorized, will submit soon". Choose the next staff status.');
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

  return (
    <ScreenShell showBanner={false}>
      <Text style={styles.title}>{candidate.name || 'Candidate'}</Text>
      <Text style={styles.subtitle}>{candidate.email}</Text>
      <Text style={styles.subtitle}>{candidate.mobile}</Text>

      <Pressable style={styles.secondaryButton} onPress={() => void loadData()}>
        <Text style={styles.secondaryButtonText}>{isLoading ? 'Refreshing...' : 'Refresh'}</Text>
      </Pressable>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assigned Firms</Text>
        {isLoading ? (
          <Text style={styles.emptyText}>Loading assignments...</Text>
        ) : assignments.length === 0 ? (
          <Text style={styles.emptyText}>No firms assigned yet.</Text>
        ) : (
          assignments.map((assignment) => {
            const rowBusy =
              busyAction === `status:${assignment.id}` ||
              busyAction === `unassign:${assignment.id}`;
            return (
              <View key={assignment.id} style={styles.card}>
                <Text style={styles.cardTitle}>{assignment.firm.name}</Text>
                <Text style={styles.cardText}>{assignment.status_enum}</Text>
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
          placeholderTextColor="#94A3B8"
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
                Candidate-only status. Select a staff status to continue.
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
    color: '#0F172A',
    flex: 1,
    flexShrink: 1,
    fontWeight: '600',
    minWidth: 0,
    paddingRight: 8,
  },
  assignRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    padding: 10,
  },
  body: {
    color: '#475569',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardSubtle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },
  cardText: {
    color: '#0F766E',
    marginTop: 4,
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  dangerButtonSmall: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dangerButtonSmallText: {
    color: '#991B1B',
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: '#64748B',
    paddingVertical: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  message: {
    color: '#334155',
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
    backgroundColor: 'rgba(15,23,42,0.35)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    width: '100%',
  },
  modalHelper: {
    color: '#92400E',
    fontSize: 12,
  },
  modalSubtitle: {
    color: '#475569',
    marginTop: 2,
  },
  modalTitle: {
    color: '#0F172A',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
  },
  secondaryButtonModal: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minWidth: 140,
    padding: 12,
  },
  secondaryButtonModalText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  statusOption: {
    borderColor: '#CBD5E1',
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
    backgroundColor: '#ECFEFF',
    borderColor: '#14B8A6',
  },
  statusOptionText: {
    color: '#0F172A',
    fontSize: 13,
  },
  statusOptionTextSelected: {
    color: '#115E59',
    fontWeight: '700',
  },
  subtitle: {
    color: '#475569',
  },
  title: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '700',
  },
});
