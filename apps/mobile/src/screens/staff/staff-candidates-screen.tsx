import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CITY_OPTIONS,
  filterCandidatesBySearchCityPractice,
  getJdDegreeDateLabel,
  getJdDegreeYear,
  PRACTICE_AREAS,
  type CityOption,
  type PracticeArea,
} from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import type { StaffCandidateListItem } from '../../features/staff-candidate-management';
import { listStaffCandidates } from '../../features/staff-candidate-management';
import { uiColors } from '../../theme/colors';

const COLLAPSED_BUBBLE_ROWS_HEIGHT = 34;

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected ? styles.chipSelected : null]}>
      <Text style={selected ? styles.chipTextSelected : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

export function StaffCandidatesScreen({
  onOpenCandidate,
}: {
  onOpenCandidate: (candidate: StaffCandidateListItem) => void;
}) {
  const [candidates, setCandidates] = useState<StaffCandidateListItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCities, setSelectedCities] = useState<CityOption[]>([]);
  const [selectedPracticeAreas, setSelectedPracticeAreas] = useState<PracticeArea[]>([]);
  const [selectedJdYears, setSelectedJdYears] = useState<string[]>([]);
  const [showAllCityFilters, setShowAllCityFilters] = useState(false);
  const [showAllPracticeFilters, setShowAllPracticeFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listStaffCandidates();
      setCandidates(rows);
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

  const filteredCandidates = useMemo(() => {
    return filterCandidatesBySearchCityPractice(candidates, {
      query,
      selectedCities,
      selectedPracticeAreas,
      selectedJdYears,
    });
  }, [candidates, query, selectedCities, selectedPracticeAreas, selectedJdYears]);

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

  return (
    <ScreenShell showBanner={false}>
      <Text style={styles.title}>Candidates</Text>
      <Text style={styles.body}>
        Select a candidate to manage visible firms and status updates.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Search name, email, or mobile"
        placeholderTextColor="#94A3B8"
        value={query}
        autoCapitalize="none"
        onChangeText={setQuery}
      />

      <Text style={styles.filterLabel}>Filter by city</Text>
      <View style={[styles.chipWrap, !showAllCityFilters && styles.chipWrapCollapsed]}>
        {CITY_OPTIONS.map((city) => {
          const selected = selectedCities.includes(city);
          return (
            <FilterChip
              key={city}
              label={city}
              selected={selected}
              onPress={() => {
                setSelectedCities((current) => (selected
                  ? current.filter((value) => value !== city)
                  : [...current, city]));
              }}
            />
          );
        })}
      </View>
      <Pressable style={styles.expandButton} onPress={() => setShowAllCityFilters((value) => !value)}>
        <Text style={styles.expandButtonText}>{showAllCityFilters ? 'Show less' : 'See more'}</Text>
      </Pressable>

      <Text style={styles.filterLabel}>Filter by practice</Text>
      <View style={[styles.chipWrap, !showAllPracticeFilters && styles.chipWrapCollapsed]}>
        {PRACTICE_AREAS.map((area) => {
          const selected = selectedPracticeAreas.includes(area);
          return (
            <FilterChip
              key={area}
              label={area}
              selected={selected}
              onPress={() => {
                setSelectedPracticeAreas((current) => (selected
                  ? current.filter((value) => value !== area)
                  : [...current, area]));
              }}
            />
          );
        })}
      </View>
      <Pressable style={styles.expandButton} onPress={() => setShowAllPracticeFilters((value) => !value)}>
        <Text style={styles.expandButtonText}>{showAllPracticeFilters ? 'Show less' : 'See more'}</Text>
      </Pressable>

      <Text style={styles.filterLabel}>Filter by JD year</Text>
      {jdYearOptions.length === 0 ? (
        <Text style={styles.emptyText}>No JD years available.</Text>
      ) : (
        <View style={styles.chipWrap}>
          {jdYearOptions.map((year) => {
            const selected = selectedJdYears.includes(year);
            return (
              <FilterChip
                key={year}
                label={year}
                selected={selected}
                onPress={() => {
                  setSelectedJdYears((current) => (selected
                    ? current.filter((value) => value !== year)
                    : [...current, year]));
                }}
              />
            );
          })}
        </View>
      )}

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
              <View style={styles.cardHeader}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>
                    {(candidate.name || 'C').trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTitle}>{candidate.name || 'Unnamed Candidate'}</Text>
                  <Text style={styles.cardText}>{candidate.email}</Text>
                  <Text style={styles.cardSubtle}>{candidate.mobile || 'No mobile on file'}</Text>
                  <Text style={styles.cardSubtle}>
                    JD degree date: {getJdDegreeDateLabel(candidate.jdDegreeDate)}
                  </Text>
                </View>
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
  avatarPlaceholder: {
    alignItems: 'center',
    backgroundColor: uiColors.divider,
    borderColor: uiColors.border,
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarPlaceholderText: {
    color: uiColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardPressed: {
    backgroundColor: uiColors.background,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
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
  chip: {
    backgroundColor: uiColors.divider,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: uiColors.primary,
  },
  chipText: {
    color: uiColors.textPrimary,
    fontSize: 12,
  },
  chipTextSelected: {
    color: uiColors.primaryText,
    fontSize: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipWrapCollapsed: {
    maxHeight: COLLAPSED_BUBBLE_ROWS_HEIGHT,
    overflow: 'hidden',
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
  expandButton: {
    alignSelf: 'flex-start',
    marginTop: -4,
  },
  expandButtonText: {
    color: uiColors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterLabel: {
    color: uiColors.textPrimary,
    fontWeight: '600',
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
  title: {
    color: uiColors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
});
