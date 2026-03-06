import { filterStaffCandidates, FIRM_STATUSES } from '@zenith/shared';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenShell } from '../../components/screen-shell';
import { StaffPageTitle } from '../../components/staff-page-title';
import { sendJobOpportunityNotificationToCandidates } from '../../features/staff-candidate-management';
import { ensureValidSession } from '../../lib/supabase';
import { uiColors } from '../../theme/colors';
import type { StaffCandidatesStackParamList } from '../../navigation/staff-candidates-types';
import {
  DEFAULT_STAFF_CANDIDATE_FILTERS,
  type StaffCandidateFilters,
} from './staff-candidate-filtering';

type Props = NativeStackScreenProps<StaffCandidatesStackParamList, 'StaffCandidateFilters'>;

type ModalMode =
  | 'assignedRecruiter'
  | 'currentStatus'
  | 'jobOpportunityPushConsent'
  | 'practices'
  | 'assignedFirmIds'
  | 'preferredCities'
  | 'jdYears'
  | null;

function formatMultiValue(valueLabels: string[]): string {
  if (valueLabels.length === 0) {
    return 'Any';
  }
  if (valueLabels.length <= 2) {
    return valueLabels.join(', ');
  }
  return `${valueLabels.slice(0, 2).join(', ')} +${valueLabels.length - 2}`;
}

function ToggleRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.optionRow, selected ? styles.optionRowSelected : null]} onPress={onPress}>
      <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>{label}</Text>
      {selected ? <Text style={styles.checkmark}>✓</Text> : null}
    </Pressable>
  );
}

export function StaffCandidateFiltersScreen({ navigation, route }: Props) {
  const [draftFilters, setDraftFilters] = useState<StaffCandidateFilters>(route.params.initialFilters);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [assignedFirmQuery, setAssignedFirmQuery] = useState('');
  const [jdYearInput, setJdYearInput] = useState('');
  const [jdYearRangeStart, setJdYearRangeStart] = useState('');
  const [jdYearRangeEnd, setJdYearRangeEnd] = useState('');
  const [jdYearInputError, setJdYearInputError] = useState<string | null>(null);
  const [showNotificationComposer, setShowNotificationComposer] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationBody, setNotificationBody] = useState('');
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  const recruiterLabelById = useMemo(
    () => new Map(route.params.options.recruiterOptions.map((option) => [option.id, option.label])),
    [route.params.options.recruiterOptions],
  );
  const firmLabelById = useMemo(
    () => new Map(route.params.options.assignedFirmOptions.map((option) => [option.id, option.label])),
    [route.params.options.assignedFirmOptions],
  );

  const assignedRecruiterLabel = draftFilters.assignedRecruiter === 'any'
    ? 'Any'
    : draftFilters.assignedRecruiter === 'none'
      ? 'None'
      : recruiterLabelById.get(draftFilters.assignedRecruiter) ?? 'Any';
  const currentStatusLabel = draftFilters.currentStatus === 'any' ? 'Any' : draftFilters.currentStatus;
  const pushNotificationsLabel = draftFilters.jobOpportunityPushConsent === 'any'
    ? 'Any'
    : draftFilters.jobOpportunityPushConsent === 'accepted'
      ? 'Accepted'
      : 'Not accepted';
  const practicesLabel = formatMultiValue(draftFilters.practices);
  const assignedFirmsLabel = formatMultiValue(
    draftFilters.assignedFirmIds
      .map((firmId) => firmLabelById.get(firmId))
      .filter((value): value is string => Boolean(value)),
  );
  const preferredCitiesLabel = formatMultiValue(draftFilters.preferredCities);
  const jdYearsLabel = formatMultiValue(draftFilters.jdYears);

  const filteredAssignedFirmOptions = useMemo(() => {
    const normalizedQuery = assignedFirmQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return route.params.options.assignedFirmOptions;
    }

    return route.params.options.assignedFirmOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery),
    );
  }, [assignedFirmQuery, route.params.options.assignedFirmOptions]);

  const matchingCandidates = useMemo(
    () =>
      filterStaffCandidates(route.params.candidates, {
        query: route.params.query,
        assignedRecruiter: draftFilters.assignedRecruiter,
        currentStatus: draftFilters.currentStatus,
        jobOpportunityPushConsent: draftFilters.jobOpportunityPushConsent,
        practices: draftFilters.practices,
        assignedFirmIds: draftFilters.assignedFirmIds,
        preferredCities: draftFilters.preferredCities,
        jdYears: draftFilters.jdYears,
      }),
    [draftFilters, route.params.candidates, route.params.query],
  );

  const consentedRecipients = useMemo(
    () => matchingCandidates.filter((candidate) => candidate.acceptedJobOpportunityPushNotifications),
    [matchingCandidates],
  );

  function appendJdYears(yearsToAdd: readonly string[]): void {
    setDraftFilters((current) => {
      const merged = new Set(current.jdYears);
      for (const year of yearsToAdd) {
        merged.add(year);
      }
      return {
        ...current,
        jdYears: Array.from(merged).sort((left, right) => Number(right) - Number(left)),
      };
    });
  }

  function handleAddJdYear(): void {
    const trimmedYear = jdYearInput.trim();
    if (!/^\d{4}$/.test(trimmedYear)) {
      setJdYearInputError('Enter a 4-digit year.');
      return;
    }

    appendJdYears([trimmedYear]);
    setJdYearInput('');
    setJdYearInputError(null);
  }

  function handleAddJdYearRange(): void {
    const startYearText = jdYearRangeStart.trim();
    const endYearText = jdYearRangeEnd.trim();
    if (!/^\d{4}$/.test(startYearText) || !/^\d{4}$/.test(endYearText)) {
      setJdYearInputError('Range must use two 4-digit years.');
      return;
    }

    const startYear = Number(startYearText);
    const endYear = Number(endYearText);
    if (startYear > endYear) {
      setJdYearInputError('Range start year must be before end year.');
      return;
    }

    const rangeSize = endYear - startYear + 1;
    if (rangeSize > 50) {
      setJdYearInputError('Range is too large. Use 50 years or less.');
      return;
    }

    const yearsToAdd: string[] = [];
    for (let year = startYear; year <= endYear; year += 1) {
      yearsToAdd.push(String(year));
    }
    appendJdYears(yearsToAdd);
    setJdYearRangeStart('');
    setJdYearRangeEnd('');
    setJdYearInputError(null);
  }

  async function handleSendNotification(): Promise<void> {
    const trimmedTitle = notificationTitle.trim();
    const trimmedBody = notificationBody.trim();
    if (!trimmedTitle || !trimmedBody) {
      setNotificationMessage('Enter both a title and a message.');
      return;
    }

    if (consentedRecipients.length === 0) {
      setNotificationMessage('No consented candidates match the current filters.');
      return;
    }

    setIsSendingNotification(true);
    setNotificationMessage(null);

    try {
      await ensureValidSession();
      const response = await sendJobOpportunityNotificationToCandidates({
        candidateIds: consentedRecipients.map((candidate) => candidate.id),
        title: trimmedTitle,
        body: trimmedBody,
        filterSnapshot: {
          query: route.params.query,
          filters: draftFilters,
          matching_candidate_count: matchingCandidates.length,
          consented_candidate_count: consentedRecipients.length,
        },
      });

      const summary =
        `Queued ${response.queued_count} notification${response.queued_count === 1 ? '' : 's'} and skipped ${response.skipped_count}.`;
      setShowNotificationComposer(false);
      setNotificationTitle('');
      setNotificationBody('');
      setNotificationMessage(summary);
    } catch (error) {
      setNotificationMessage((error as Error).message);
    } finally {
      setIsSendingNotification(false);
    }
  }

  return (
    <ScreenShell showBanner={false}>
      <StaffPageTitle title="Filter Search" />
      <Text style={styles.subtitle}>Filter candidate results</Text>

      <View style={styles.panel}>
        <Pressable style={styles.filterField} onPress={() => setModalMode('assignedRecruiter')}>
          <Text style={styles.filterLabel}>Assigned recruiter</Text>
          <View style={styles.filterValueRow}>
            <Text style={styles.filterValue}>{assignedRecruiterLabel}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Pressable>

        <Pressable style={styles.filterField} onPress={() => setModalMode('currentStatus')}>
          <Text style={styles.filterLabel}>Current status</Text>
          <View style={styles.filterValueRow}>
            <Text style={styles.filterValue}>{currentStatusLabel}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Pressable>

        <Pressable style={styles.filterField} onPress={() => setModalMode('jobOpportunityPushConsent')}>
          <Text style={styles.filterLabel}>Push notifications</Text>
          <View style={styles.filterValueRow}>
            <Text style={styles.filterValue}>{pushNotificationsLabel}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Pressable>

        <Pressable style={styles.filterField} onPress={() => setModalMode('practices')}>
          <Text style={styles.filterLabel}>Practices</Text>
          <View style={styles.filterValueRow}>
            <Text style={styles.filterValue}>{practicesLabel}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.filterField}
          onPress={() => {
            setAssignedFirmQuery('');
            setModalMode('assignedFirmIds');
          }}
        >
          <Text style={styles.filterLabel}>Assigned firms</Text>
          <View style={styles.filterValueRow}>
            <Text style={styles.filterValue}>{assignedFirmsLabel}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Pressable>

        <Pressable style={styles.filterField} onPress={() => setModalMode('preferredCities')}>
          <Text style={styles.filterLabel}>Preferred cities</Text>
          <View style={styles.filterValueRow}>
            <Text style={styles.filterValue}>{preferredCitiesLabel}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.filterField}
          onPress={() => {
            setModalMode('jdYears');
            setJdYearInput('');
            setJdYearRangeStart('');
            setJdYearRangeEnd('');
            setJdYearInputError(null);
          }}
        >
          <Text style={styles.filterLabel}>JD years</Text>
          <View style={styles.filterValueRow}>
            <Text style={styles.filterValue}>{jdYearsLabel}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Pressable>

        <Pressable
          style={[
            styles.sendNotificationButton,
            consentedRecipients.length === 0 ? styles.sendNotificationButtonDisabled : null,
          ]}
          disabled={consentedRecipients.length === 0}
          onPress={() => {
            setNotificationMessage(null);
            setShowNotificationComposer(true);
          }}
        >
          <Text style={styles.sendNotificationButtonText}>
            Send Notification ({consentedRecipients.length})
          </Text>
        </Pressable>

        <View style={styles.footerActions}>
          <Pressable
            style={styles.clearButton}
            onPress={() => {
              setDraftFilters(DEFAULT_STAFF_CANDIDATE_FILTERS);
              setNotificationMessage(null);
            }}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
          <Pressable
            style={styles.applyButton}
            onPress={() => {
              setNotificationMessage(null);
              navigation.navigate('StaffCandidatesList', { appliedFilters: draftFilters });
            }}
          >
            <Text style={styles.applyButtonText}>Apply</Text>
          </Pressable>
        </View>

        <Text style={styles.resultSummaryText}>
          {matchingCandidates.length} matching candidates. {consentedRecipients.length} have accepted job-opportunity push notifications.
        </Text>
        {notificationMessage ? <Text style={styles.notificationMessageText}>{notificationMessage}</Text> : null}
      </View>

      <Modal
        transparent
        visible={modalMode !== null}
        animationType="fade"
        onRequestClose={() => setModalMode(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select filter</Text>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              {modalMode === 'assignedRecruiter' ? (
                <>
                  <ToggleRow
                    label="Any"
                    selected={draftFilters.assignedRecruiter === 'any'}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, assignedRecruiter: 'any' }));
                      setModalMode(null);
                    }}
                  />
                  <ToggleRow
                    label="None"
                    selected={draftFilters.assignedRecruiter === 'none'}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, assignedRecruiter: 'none' }));
                      setModalMode(null);
                    }}
                  />
                  {route.params.options.recruiterOptions.map((option) => (
                    <ToggleRow
                      key={option.id}
                      label={option.label}
                      selected={draftFilters.assignedRecruiter === option.id}
                      onPress={() => {
                        setDraftFilters((current) => ({ ...current, assignedRecruiter: option.id }));
                        setModalMode(null);
                      }}
                    />
                  ))}
                </>
              ) : null}

              {modalMode === 'currentStatus' ? (
                <>
                  <ToggleRow
                    label="Any"
                    selected={draftFilters.currentStatus === 'any'}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, currentStatus: 'any' }));
                      setModalMode(null);
                    }}
                  />
                  {FIRM_STATUSES.map((status) => (
                    <ToggleRow
                      key={status}
                      label={status}
                      selected={draftFilters.currentStatus === status}
                      onPress={() => {
                        setDraftFilters((current) => ({ ...current, currentStatus: status }));
                        setModalMode(null);
                      }}
                    />
                  ))}
                </>
              ) : null}

              {modalMode === 'jobOpportunityPushConsent' ? (
                <>
                  <ToggleRow
                    label="Any"
                    selected={draftFilters.jobOpportunityPushConsent === 'any'}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, jobOpportunityPushConsent: 'any' }));
                      setModalMode(null);
                    }}
                  />
                  <ToggleRow
                    label="Accepted"
                    selected={draftFilters.jobOpportunityPushConsent === 'accepted'}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, jobOpportunityPushConsent: 'accepted' }));
                      setModalMode(null);
                    }}
                  />
                  <ToggleRow
                    label="Not accepted"
                    selected={draftFilters.jobOpportunityPushConsent === 'not_accepted'}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, jobOpportunityPushConsent: 'not_accepted' }));
                      setModalMode(null);
                    }}
                  />
                </>
              ) : null}

              {modalMode === 'practices' ? (
                <>
                  <ToggleRow
                    label="Any"
                    selected={draftFilters.practices.length === 0}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, practices: [] }));
                    }}
                  />
                  {route.params.options.practiceOptions.map((practice) => (
                    <ToggleRow
                      key={practice}
                      label={practice}
                      selected={draftFilters.practices.includes(practice)}
                      onPress={() => {
                        setDraftFilters((current) => ({
                          ...current,
                          practices: current.practices.includes(practice)
                            ? current.practices.filter((value) => value !== practice)
                            : [...current.practices, practice],
                        }));
                      }}
                    />
                  ))}
                </>
              ) : null}

              {modalMode === 'assignedFirmIds' ? (
                <>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Search firms"
                    placeholderTextColor={uiColors.textPlaceholder}
                    value={assignedFirmQuery}
                    onChangeText={setAssignedFirmQuery}
                  />
                  <ToggleRow
                    label="Any"
                    selected={draftFilters.assignedFirmIds.length === 0}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, assignedFirmIds: [] }));
                    }}
                  />
                  {filteredAssignedFirmOptions.length === 0 ? (
                    <Text style={styles.emptySelectionText}>No matching firms.</Text>
                  ) : null}
                  {filteredAssignedFirmOptions.map((firm) => {
                    const selected = draftFilters.assignedFirmIds.includes(firm.id);
                    return (
                      <ToggleRow
                        key={firm.id}
                        label={firm.label}
                        selected={selected}
                        onPress={() => {
                          setDraftFilters((current) => ({
                            ...current,
                            assignedFirmIds: selected
                              ? current.assignedFirmIds.filter((value) => value !== firm.id)
                              : [...current.assignedFirmIds, firm.id],
                          }));
                        }}
                      />
                    );
                  })}
                </>
              ) : null}

              {modalMode === 'preferredCities' ? (
                <>
                  <ToggleRow
                    label="Any"
                    selected={draftFilters.preferredCities.length === 0}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, preferredCities: [] }));
                    }}
                  />
                  {route.params.options.preferredCityOptions.map((city) => {
                    const selected = draftFilters.preferredCities.includes(city);
                    return (
                      <ToggleRow
                        key={city}
                        label={city}
                        selected={selected}
                        onPress={() => {
                          setDraftFilters((current) => ({
                            ...current,
                            preferredCities: selected
                              ? current.preferredCities.filter((value) => value !== city)
                              : [...current.preferredCities, city],
                          }));
                        }}
                      />
                    );
                  })}
                </>
              ) : null}

              {modalMode === 'jdYears' ? (
                <>
                  <View style={styles.jdYearInputRow}>
                    <TextInput
                      style={styles.jdYearInput}
                      placeholder="Add year"
                      placeholderTextColor={uiColors.textPlaceholder}
                      value={jdYearInput}
                      keyboardType="number-pad"
                      maxLength={4}
                      onChangeText={(value) => {
                        setJdYearInput(value.replace(/[^0-9]/g, ''));
                        if (jdYearInputError) {
                          setJdYearInputError(null);
                        }
                      }}
                    />
                    <Pressable style={styles.inlineActionButton} onPress={handleAddJdYear}>
                      <Text style={styles.inlineActionButtonText}>Add year</Text>
                    </Pressable>
                  </View>
                  <View style={styles.jdYearRangeRow}>
                    <TextInput
                      style={styles.jdYearRangeInput}
                      placeholder="From"
                      placeholderTextColor={uiColors.textPlaceholder}
                      value={jdYearRangeStart}
                      keyboardType="number-pad"
                      maxLength={4}
                      onChangeText={(value) => {
                        setJdYearRangeStart(value.replace(/[^0-9]/g, ''));
                        if (jdYearInputError) {
                          setJdYearInputError(null);
                        }
                      }}
                    />
                    <TextInput
                      style={styles.jdYearRangeInput}
                      placeholder="To"
                      placeholderTextColor={uiColors.textPlaceholder}
                      value={jdYearRangeEnd}
                      keyboardType="number-pad"
                      maxLength={4}
                      onChangeText={(value) => {
                        setJdYearRangeEnd(value.replace(/[^0-9]/g, ''));
                        if (jdYearInputError) {
                          setJdYearInputError(null);
                        }
                      }}
                    />
                    <Pressable style={styles.inlineActionButton} onPress={handleAddJdYearRange}>
                      <Text style={styles.inlineActionButtonText}>Add range</Text>
                    </Pressable>
                  </View>
                  {jdYearInputError ? <Text style={styles.fieldErrorText}>{jdYearInputError}</Text> : null}
                  {draftFilters.jdYears.length === 0 ? (
                    <Text style={styles.emptySelectionText}>No year filters added.</Text>
                  ) : (
                    draftFilters.jdYears.map((year) => (
                      <View key={year} style={styles.selectedYearRow}>
                        <Text style={styles.selectedYearText}>{year}</Text>
                        <Pressable
                          onPress={() => {
                            setDraftFilters((current) => ({
                              ...current,
                              jdYears: current.jdYears.filter((value) => value !== year),
                            }));
                          }}
                        >
                          <Text style={styles.removeYearText}>Remove</Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                  <Pressable
                    style={styles.clearYearsButton}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, jdYears: [] }));
                    }}
                  >
                    <Text style={styles.clearYearsButtonText}>Clear years</Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setModalMode(null)}>
                <Text style={styles.modalCancelButtonText}>Close</Text>
              </Pressable>
              {modalMode === 'practices' || modalMode === 'assignedFirmIds' || modalMode === 'preferredCities' || modalMode === 'jdYears' ? (
                <Pressable style={styles.modalDoneButton} onPress={() => setModalMode(null)}>
                  <Text style={styles.modalDoneButtonText}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={showNotificationComposer}
        animationType="fade"
        onRequestClose={() => {
          if (!isSendingNotification) {
            setShowNotificationComposer(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send Notification</Text>
            <Text style={styles.composerSummaryText}>
              {matchingCandidates.length} candidate matches. {consentedRecipients.length} consented recipients will be submitted for push delivery.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Notification title"
              placeholderTextColor={uiColors.textPlaceholder}
              value={notificationTitle}
              onChangeText={setNotificationTitle}
              maxLength={120}
            />
            <TextInput
              style={[styles.modalInput, styles.composerBodyInput]}
              placeholder="Write a short notification message"
              placeholderTextColor={uiColors.textPlaceholder}
              value={notificationBody}
              onChangeText={setNotificationBody}
              multiline
              textAlignVertical="top"
              maxLength={400}
            />
            {notificationMessage ? <Text style={styles.notificationMessageText}>{notificationMessage}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  if (!isSendingNotification) {
                    setShowNotificationComposer(false);
                  }
                }}
              >
                <Text style={styles.modalCancelButtonText}>Close</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalDoneButton,
                  (isSendingNotification || consentedRecipients.length === 0) ? styles.sendNotificationButtonDisabled : null,
                ]}
                disabled={isSendingNotification || consentedRecipients.length === 0}
                onPress={() => {
                  void handleSendNotification();
                }}
              >
                <Text style={styles.modalDoneButtonText}>
                  {isSendingNotification ? 'Sending...' : 'Send'}
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
  subtitle: {
    color: uiColors.textSecondary,
    fontSize: 15,
    marginBottom: 12,
  },
  panel: {
    gap: 12,
  },
  filterField: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filterLabel: {
    color: uiColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  filterValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  filterValue: {
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    color: uiColors.textMuted,
    fontSize: 24,
    marginLeft: 8,
    marginTop: -4,
  },
  sendNotificationButton: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  sendNotificationButtonDisabled: {
    opacity: 0.45,
  },
  sendNotificationButtonText: {
    color: uiColors.primaryText,
    fontSize: 16,
    fontWeight: '700',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  clearButtonText: {
    color: uiColors.textSecondary,
    fontSize: 20,
    fontWeight: '700',
  },
  applyButton: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  applyButtonText: {
    color: uiColors.primaryText,
    fontSize: 20,
    fontWeight: '700',
  },
  resultSummaryText: {
    color: uiColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  notificationMessageText: {
    color: uiColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 560,
    padding: 18,
    width: '100%',
  },
  modalTitle: {
    color: uiColors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalScroll: {
    maxHeight: 420,
  },
  modalScrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  modalInput: {
    backgroundColor: uiColors.backgroundAlt,
    borderColor: uiColors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    color: uiColors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  composerBodyInput: {
    minHeight: 120,
    paddingTop: 14,
  },
  composerSummaryText: {
    color: uiColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  optionRow: {
    alignItems: 'center',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionRowSelected: {
    backgroundColor: uiColors.backgroundAlt,
    borderColor: uiColors.primary,
  },
  optionLabel: {
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 15,
  },
  optionLabelSelected: {
    fontWeight: '700',
  },
  checkmark: {
    color: uiColors.primary,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  modalCancelButton: {
    alignItems: 'center',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalCancelButtonText: {
    color: uiColors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  modalDoneButton: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalDoneButtonText: {
    color: uiColors.primaryText,
    fontSize: 16,
    fontWeight: '700',
  },
  emptySelectionText: {
    color: uiColors.textMuted,
    fontSize: 15,
    marginTop: 8,
  },
  jdYearInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  jdYearInput: {
    backgroundColor: uiColors.backgroundAlt,
    borderColor: uiColors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  jdYearRangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  jdYearRangeInput: {
    backgroundColor: uiColors.backgroundAlt,
    borderColor: uiColors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inlineActionButton: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  inlineActionButtonText: {
    color: uiColors.primaryText,
    fontSize: 15,
    fontWeight: '700',
  },
  fieldErrorText: {
    color: uiColors.error,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  selectedYearRow: {
    alignItems: 'center',
    backgroundColor: uiColors.backgroundAlt,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedYearText: {
    color: uiColors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  removeYearText: {
    color: uiColors.link,
    fontSize: 14,
    fontWeight: '700',
  },
  clearYearsButton: {
    alignItems: 'center',
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
  },
  clearYearsButtonText: {
    color: uiColors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
});
