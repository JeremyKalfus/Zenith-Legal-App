import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CITY_OPTIONS,
  filterStaffCandidates,
  getJdDegreeDateLabel,
  getJdDegreeYear,
  PRACTICE_AREAS,
} from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { StaffPageTitle } from '../../components/staff-page-title';
import type {
  RecruiterUserOption,
  StaffCandidateListItem,
  StaffFirmOption,
} from '../../features/staff-candidate-management';
import {
  listActiveFirms,
  listRecruiterUsers,
  listStaffCandidates,
} from '../../features/staff-candidate-management';
import type { StaffCandidatesStackParamList } from '../../navigation/staff-candidates-stack';
import {
  DEFAULT_STAFF_CANDIDATE_FILTERS,
  type StaffCandidateFilters,
} from './staff-candidate-filters-screen';
import { uiColors } from '../../theme/colors';

function countActiveFilters(filters: StaffCandidateFilters): number {
  let count = 0;
  if (filters.assignedRecruiter !== 'any') {
    count += 1;
  }
  if (filters.currentStatus !== 'any') {
    count += 1;
  }
  if (filters.practice !== 'any') {
    count += 1;
  }
  if (filters.assignedFirmIds.length > 0) {
    count += 1;
  }
  if (filters.preferredCities.length > 0) {
    count += 1;
  }
  if (filters.jdYears.length > 0) {
    count += 1;
  }
  return count;
}

function toRecruiterOptions(recruiters: RecruiterUserOption[]): { id: string; label: string }[] {
  return recruiters.map((recruiter) => ({
    id: recruiter.id,
    label: recruiter.displayName,
  }));
}

function toFirmOptions(firms: StaffFirmOption[]): { id: string; label: string }[] {
  return firms.map((firm) => ({
    id: firm.id,
    label: firm.name,
  }));
}

function formatAssignedRecruiter(candidate: StaffCandidateListItem): string {
  return candidate.assignedRecruiterDisplayName ?? 'None';
}

export function StaffCandidatesScreen({
  incomingAppliedFilters,
  onOpenCandidate,
  onOpenFilterSearch,
}: {
  incomingAppliedFilters?: StaffCandidateFilters;
  onOpenCandidate: (candidate: StaffCandidateListItem) => void;
  onOpenFilterSearch: (params: StaffCandidatesStackParamList['StaffCandidateFilters']) => void;
}) {
  const [candidates, setCandidates] = useState<StaffCandidateListItem[]>([]);
  const [firms, setFirms] = useState<StaffFirmOption[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterUserOption[]>([]);
  const [query, setQuery] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<StaffCandidateFilters>(DEFAULT_STAFF_CANDIDATE_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    try {
      const [candidateRows, activeFirms, recruiterRows] = await Promise.all([
        listStaffCandidates(),
        listActiveFirms(),
        listRecruiterUsers(),
      ]);
      setCandidates(candidateRows);
      setFirms(activeFirms);
      setRecruiters(recruiterRows);
      setMessage(null);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (!incomingAppliedFilters) {
      return;
    }
    setAppliedFilters(incomingAppliedFilters);
  }, [incomingAppliedFilters]);

  const jdYearOptions = useMemo(
    () =>
      Array.from(
        new Set(
          candidates
            .map((candidate) => getJdDegreeYear(candidate.jdDegreeDate))
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => Number(right) - Number(left)),
    [candidates],
  );

  const filteredCandidates = useMemo(() => {
    return filterStaffCandidates(candidates, {
      query,
      assignedRecruiter: appliedFilters.assignedRecruiter,
      currentStatus: appliedFilters.currentStatus,
      practice: appliedFilters.practice,
      assignedFirmIds: appliedFilters.assignedFirmIds,
      preferredCities: appliedFilters.preferredCities,
      jdYears: appliedFilters.jdYears,
    });
  }, [appliedFilters, candidates, query]);

  const filterOptions = useMemo(
    () => ({
      recruiterOptions: toRecruiterOptions(recruiters),
      practiceOptions: PRACTICE_AREAS,
      assignedFirmOptions: toFirmOptions(firms),
      preferredCityOptions: CITY_OPTIONS,
      jdYearOptions,
    }),
    [firms, jdYearOptions, recruiters],
  );

  const activeFilterCount = countActiveFilters(appliedFilters);

  return (
    <ScreenShell showBanner={false}>
      <StaffPageTitle
        title="Candidates"
        rightContent={(
          <Pressable
            style={styles.filterSearchButton}
            onPress={() => {
              onOpenFilterSearch({
                initialFilters: appliedFilters,
                options: filterOptions,
              });
            }}
          >
            <Text style={styles.filterSearchButtonText}>
              Filter Search{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </Pressable>
        )}
      />
      <Text style={styles.body}>Select a candidate to manage recruiter assignments and firm statuses.</Text>

      <TextInput
        style={styles.input}
        placeholder="Search name, email, or mobile"
        placeholderTextColor={uiColors.textPlaceholder}
        value={query}
        autoCapitalize="none"
        onChangeText={setQuery}
      />

      <Pressable style={styles.secondaryButton} onPress={() => void loadCandidates()}>
        <Text style={styles.secondaryButtonText}>{isLoading ? 'Refreshing...' : 'Refresh list'}</Text>
      </Pressable>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <View style={styles.list}>
        {isLoading ? (
          <Text style={styles.emptyText}>Loading candidates...</Text>
        ) : filteredCandidates.length === 0 ? (
          <Text style={styles.emptyText}>No candidates found.</Text>
        ) : (
          filteredCandidates.map((candidate) => (
            <Pressable
              key={candidate.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => onOpenCandidate(candidate)}
            >
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle}>{candidate.name || 'Unnamed Candidate'}</Text>
                <Text style={styles.cardText}>{candidate.email}</Text>
                <Text style={styles.cardSubtle}>{candidate.mobile || 'No mobile on file'}</Text>
                <Text style={styles.cardSubtle}>
                  JD degree date: {getJdDegreeDateLabel(candidate.jdDegreeDate)}
                </Text>
                <Text style={styles.cardSubtle}>Assigned recruiter: {formatAssignedRecruiter(candidate)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    color: uiColors.textSecondary,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
  },
  cardPressed: {
    backgroundColor: uiColors.background,
  },
  cardSubtle: {
    color: uiColors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  cardText: {
    color: uiColors.textStrong,
    marginTop: 2,
  },
  cardTitle: {
    color: uiColors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: uiColors.textMuted,
    padding: 12,
    textAlign: 'center',
  },
  error: {
    color: uiColors.error,
    fontSize: 13,
  },
  filterSearchButton: {
    alignItems: 'center',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterSearchButtonText: {
    color: uiColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
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
  list: {
    gap: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: uiColors.border,
    borderRadius: 10,
    padding: 10,
  },
  secondaryButtonText: {
    color: uiColors.textPrimary,
    fontWeight: '600',
  },
});
