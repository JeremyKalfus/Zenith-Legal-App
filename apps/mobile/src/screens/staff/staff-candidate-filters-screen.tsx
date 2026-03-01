import { FIRM_STATUSES, type CityOption, type FirmStatus, type PracticeArea } from '@zenith/shared';
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
import { uiColors } from '../../theme/colors';
import type { StaffCandidatesStackParamList } from '../../navigation/staff-candidates-stack';

export type StaffCandidateFilters = {
  assignedRecruiter: 'any' | 'none' | string;
  currentStatus: 'any' | FirmStatus;
  practice: 'any' | PracticeArea;
  assignedFirmIds: string[];
  preferredCities: CityOption[];
  jdYears: string[];
};

export const DEFAULT_STAFF_CANDIDATE_FILTERS: StaffCandidateFilters = {
  assignedRecruiter: 'any',
  currentStatus: 'any',
  practice: 'any',
  assignedFirmIds: [],
  preferredCities: [],
  jdYears: [],
};

export type StaffCandidateFilterOptions = {
  recruiterOptions: readonly { id: string; label: string }[];
  practiceOptions: readonly PracticeArea[];
  assignedFirmOptions: readonly { id: string; label: string }[];
  preferredCityOptions: readonly CityOption[];
  jdYearOptions: readonly string[];
};
type Props = NativeStackScreenProps<StaffCandidatesStackParamList, 'StaffCandidateFilters'>;
type ModalMode =
  | 'assignedRecruiter'
  | 'currentStatus'
  | 'practice'
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
  const [jdYearInput, setJdYearInput] = useState('');
  const [jdYearRangeStart, setJdYearRangeStart] = useState('');
  const [jdYearRangeEnd, setJdYearRangeEnd] = useState('');
  const [jdYearInputError, setJdYearInputError] = useState<string | null>(null);

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
  const practiceLabel = draftFilters.practice === 'any' ? 'Any' : draftFilters.practice;
  const assignedFirmsLabel = formatMultiValue(
    draftFilters.assignedFirmIds
      .map((firmId) => firmLabelById.get(firmId))
      .filter((value): value is string => Boolean(value)),
  );
  const preferredCitiesLabel = formatMultiValue(draftFilters.preferredCities);
  const jdYearsLabel = formatMultiValue(draftFilters.jdYears);

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

        <Pressable style={styles.filterField} onPress={() => setModalMode('practice')}>
          <Text style={styles.filterLabel}>Practice</Text>
          <View style={styles.filterValueRow}>
            <Text style={styles.filterValue}>{practiceLabel}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Pressable>

        <Pressable style={styles.filterField} onPress={() => setModalMode('assignedFirmIds')}>
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

        <View style={styles.footerActions}>
          <Pressable
            style={styles.clearButton}
            onPress={() => {
              setDraftFilters(DEFAULT_STAFF_CANDIDATE_FILTERS);
            }}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
          <Pressable
            style={styles.applyButton}
            onPress={() => {
              navigation.navigate('StaffCandidatesList', { appliedFilters: draftFilters });
            }}
          >
            <Text style={styles.applyButtonText}>Apply</Text>
          </Pressable>
        </View>
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

              {modalMode === 'practice' ? (
                <>
                  <ToggleRow
                    label="Any"
                    selected={draftFilters.practice === 'any'}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, practice: 'any' }));
                      setModalMode(null);
                    }}
                  />
                  {route.params.options.practiceOptions.map((practice) => (
                    <ToggleRow
                      key={practice}
                      label={practice}
                      selected={draftFilters.practice === practice}
                      onPress={() => {
                        setDraftFilters((current) => ({ ...current, practice }));
                        setModalMode(null);
                      }}
                    />
                  ))}
                </>
              ) : null}

              {modalMode === 'assignedFirmIds' ? (
                <>
                  <ToggleRow
                    label="Any"
                    selected={draftFilters.assignedFirmIds.length === 0}
                    onPress={() => {
                      setDraftFilters((current) => ({ ...current, assignedFirmIds: [] }));
                    }}
                  />
                  {route.params.options.assignedFirmOptions.map((firm) => {
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
                      placeholder="Add year (e.g. 2024)"
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
                    <Pressable style={styles.addYearButton} onPress={handleAddJdYear}>
                      <Text style={styles.addYearButtonText}>Add year</Text>
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
                    <Pressable style={styles.addYearButton} onPress={handleAddJdYearRange}>
                      <Text style={styles.addYearButtonText}>Add range</Text>
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
              {modalMode === 'assignedFirmIds' || modalMode === 'preferredCities' || modalMode === 'jdYears' ? (
                <Pressable style={styles.modalDoneButton} onPress={() => setModalMode(null)}>
                  <Text style={styles.modalDoneButtonText}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
  addYearButton: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  addYearButtonText: {
    color: uiColors.primaryText,
    fontSize: 16,
    fontWeight: '700',
  },
  checkmark: {
    color: uiColors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  chevron: {
    color: uiColors.textMuted,
    fontSize: 24,
    marginLeft: 8,
    marginTop: -4,
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
  emptySelectionText: {
    color: uiColors.textMuted,
    fontSize: 15,
    marginTop: 8,
  },
  fieldErrorText: {
    color: uiColors.error,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
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
    color: uiColors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  filterValue: {
    color: uiColors.textPrimary,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  filterValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  jdYearInput: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  jdYearInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  jdYearRangeInput: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  jdYearRangeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: uiColors.modalOverlay,
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalCancelButton: {
    alignItems: 'center',
    borderColor: uiColors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 90,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelButtonText: {
    color: uiColors.textSecondary,
    fontWeight: '600',
  },
  modalCard: {
    backgroundColor: uiColors.surface,
    borderRadius: 14,
    maxHeight: '80%',
    padding: 14,
    width: '100%',
  },
  modalDoneButton: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    minWidth: 90,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalDoneButtonText: {
    color: uiColors.primaryText,
    fontWeight: '700',
  },
  modalScroll: {
    marginTop: 8,
  },
  modalScrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
  modalTitle: {
    color: uiColors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  optionLabel: {
    color: uiColors.textPrimary,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  optionLabelSelected: {
    color: uiColors.primary,
  },
  optionRow: {
    alignItems: 'center',
    borderColor: uiColors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionRowSelected: {
    backgroundColor: uiColors.backgroundAlt,
    borderColor: uiColors.primary,
  },
  removeYearText: {
    color: uiColors.error,
    fontSize: 14,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: uiColors.backgroundAlt,
    borderColor: uiColors.borderStrong,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  subtitle: {
    color: uiColors.textSecondary,
    fontSize: 18,
    marginTop: -4,
  },
  selectedYearRow: {
    alignItems: 'center',
    borderBottomColor: uiColors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 4,
  },
  selectedYearText: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
