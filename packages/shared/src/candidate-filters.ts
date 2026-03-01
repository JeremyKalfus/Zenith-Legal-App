import {
  CITY_OPTIONS,
  getJdDegreeYear,
  PRACTICE_AREAS,
  type CityOption,
  type PracticeArea,
} from './domain';

const cityOptionSet = new Set<string>(CITY_OPTIONS as readonly string[]);
const practiceAreaSet = new Set<string>(PRACTICE_AREAS as readonly string[]);

export type CandidatePreferenceLikeRow = {
  cities?: unknown;
  practice_areas?: unknown;
  practice_area?: unknown;
};

export type CandidateFilterable = {
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  preferredCities?: readonly CityOption[] | null;
  practiceAreas?: readonly PracticeArea[] | null;
  jdDegreeDate?: string | null;
  jd_degree_date?: string | null;
};

export type CandidateFilterInput = {
  query: string;
  selectedCities: readonly CityOption[];
  selectedPracticeAreas: readonly PracticeArea[];
  selectedJdYears?: readonly string[];
};

function isCityOption(value: unknown): value is CityOption {
  return typeof value === 'string' && cityOptionSet.has(value);
}

function isPracticeArea(value: unknown): value is PracticeArea {
  return typeof value === 'string' && practiceAreaSet.has(value);
}

function dedupe<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

export function normalizeCandidatePreferences(
  row: CandidatePreferenceLikeRow | null | undefined,
): {
  preferredCities: CityOption[];
  practiceAreas: PracticeArea[];
} {
  const preferredCities = Array.isArray(row?.cities)
    ? dedupe(row.cities.filter(isCityOption))
    : [];

  const practiceAreasFromArray = Array.isArray(row?.practice_areas)
    ? dedupe(row.practice_areas.filter(isPracticeArea))
    : [];

  const legacyPracticeArea = isPracticeArea(row?.practice_area)
    ? row.practice_area
    : null;

  const practiceAreas = practiceAreasFromArray.length > 0
    ? practiceAreasFromArray
    : legacyPracticeArea
      ? [legacyPracticeArea]
      : [];

  return {
    preferredCities,
    practiceAreas,
  };
}

export function filterCandidatesBySearchCityPractice<T extends CandidateFilterable>(
  candidates: readonly T[],
  input: CandidateFilterInput,
): T[] {
  const normalizedQuery = input.query.trim().toLowerCase();
  const selectedCitySet = new Set(input.selectedCities);
  const selectedPracticeSet = new Set(input.selectedPracticeAreas);
  const selectedJdYearSet = new Set(input.selectedJdYears ?? []);
  const hasCityFilters = selectedCitySet.size > 0;
  const hasPracticeFilters = selectedPracticeSet.size > 0;
  const hasJdYearFilters = selectedJdYearSet.size > 0;
  const hasAnyChipFilters = hasCityFilters || hasPracticeFilters || hasJdYearFilters;

  return candidates.filter((candidate) => {
    const searchMatch = normalizedQuery.length === 0 || [candidate.name, candidate.email, candidate.mobile]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(normalizedQuery));

    if (!searchMatch) {
      return false;
    }

    if (!hasAnyChipFilters) {
      return true;
    }

    const cityMatch = hasCityFilters && (candidate.preferredCities ?? [])
      .some((city) => selectedCitySet.has(city));
    const practiceMatch = hasPracticeFilters && (candidate.practiceAreas ?? [])
      .some((practiceArea) => selectedPracticeSet.has(practiceArea));
    const jdYear = getJdDegreeYear(candidate.jdDegreeDate ?? candidate.jd_degree_date);
    const jdYearMatch = hasJdYearFilters && Boolean(jdYear && selectedJdYearSet.has(jdYear));

    return cityMatch || practiceMatch || jdYearMatch;
  });
}
