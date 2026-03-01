import { describe, expect, it } from 'vitest';
import {
  filterCandidatesBySearchCityPractice,
  normalizeCandidatePreferences,
} from './candidate-filters';

describe('normalizeCandidatePreferences', () => {
  it('normalizes valid cities and practice_areas arrays', () => {
    const normalized = normalizeCandidatePreferences({
      cities: ['NYC', 'Boston', 'Invalid', 'NYC'],
      practice_areas: ['Litigation', 'Tax & Benefits', 'Nope', 'Litigation'],
    });

    expect(normalized).toEqual({
      preferredCities: ['NYC', 'Boston'],
      practiceAreas: ['Litigation', 'Tax & Benefits'],
    });
  });

  it('falls back to legacy practice_area when practice_areas is empty', () => {
    const normalized = normalizeCandidatePreferences({
      cities: ['DC'],
      practice_areas: [],
      practice_area: 'White Collar',
    });

    expect(normalized.practiceAreas).toEqual(['White Collar']);
  });

  it('returns empty arrays when row is missing or invalid', () => {
    expect(normalizeCandidatePreferences(undefined)).toEqual({
      preferredCities: [],
      practiceAreas: [],
    });

    expect(normalizeCandidatePreferences({
      cities: 'NYC',
      practice_areas: 'Litigation',
      practice_area: 'Invalid',
    })).toEqual({
      preferredCities: [],
      practiceAreas: [],
    });
  });
});

describe('filterCandidatesBySearchCityPractice', () => {
  const candidates = [
    {
      id: '1',
      name: 'Alice Adams',
      email: 'alice@example.com',
      mobile: '+12025550101',
      jdDegreeDate: '2022-05-15',
      preferredCities: ['NYC'] as const,
      practiceAreas: ['Litigation'] as const,
    },
    {
      id: '2',
      name: 'Bob Brown',
      email: 'bob@example.com',
      mobile: '+12025550102',
      jdDegreeDate: '2020-05-15',
      preferredCities: ['Boston'] as const,
      practiceAreas: ['Tax & Benefits'] as const,
    },
    {
      id: '3',
      name: 'Carol Clark',
      email: 'carol@example.com',
      mobile: '+12025550103',
      jdDegreeDate: null,
      preferredCities: [] as const,
      practiceAreas: [] as const,
    },
  ];

  it('keeps baseline search behavior when no chips are selected', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: 'alice',
      selectedCities: [],
      selectedPracticeAreas: [],
      selectedJdYears: [],
    });

    expect(result.map((candidate) => candidate.id)).toEqual(['1']);
  });

  it('filters by selected cities with OR semantics across selected city chips', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: '',
      selectedCities: ['NYC', 'Boston'],
      selectedPracticeAreas: [],
      selectedJdYears: [],
    });

    expect(result.map((candidate) => candidate.id)).toEqual(['1', '2']);
  });

  it('filters by selected practice areas with OR semantics across selected practice chips', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: '',
      selectedCities: [],
      selectedPracticeAreas: ['Tax & Benefits', 'Litigation'],
      selectedJdYears: [],
    });

    expect(result.map((candidate) => candidate.id)).toEqual(['1', '2']);
  });

  it('uses city OR practice when both chip groups are selected', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: '',
      selectedCities: ['Boston'],
      selectedPracticeAreas: ['Litigation'],
      selectedJdYears: [],
    });

    expect(result.map((candidate) => candidate.id)).toEqual(['1', '2']);
  });

  it('enforces search AND (city OR practice) when query exists', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: 'bob',
      selectedCities: ['NYC'],
      selectedPracticeAreas: ['Litigation'],
      selectedJdYears: [],
    });

    expect(result.map((candidate) => candidate.id)).toEqual([]);
  });

  it('excludes candidates with no preferences when chips are selected', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: '',
      selectedCities: ['DC'],
      selectedPracticeAreas: ['White Collar'],
      selectedJdYears: [],
    });

    expect(result.map((candidate) => candidate.id)).toEqual([]);
  });

  it('filters by selected JD graduation years', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: '',
      selectedCities: [],
      selectedPracticeAreas: [],
      selectedJdYears: ['2022'],
    });

    expect(result.map((candidate) => candidate.id)).toEqual(['1']);
  });

  it('uses JD year OR city OR practice when multiple chip groups are selected', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: '',
      selectedCities: ['Boston'],
      selectedPracticeAreas: [],
      selectedJdYears: ['2022'],
    });

    expect(result.map((candidate) => candidate.id)).toEqual(['1', '2']);
  });

  it('enforces search AND (city OR practice OR JD year)', () => {
    const result = filterCandidatesBySearchCityPractice(candidates, {
      query: 'carol',
      selectedCities: [],
      selectedPracticeAreas: [],
      selectedJdYears: ['2022'],
    });

    expect(result.map((candidate) => candidate.id)).toEqual([]);
  });
});
