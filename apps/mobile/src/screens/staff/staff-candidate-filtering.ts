import type { CityOption, FirmStatus, PracticeArea } from '@zenith/shared';

export type StaffCandidateFilters = {
  assignedRecruiter: 'any' | 'none' | string;
  currentStatus: 'any' | FirmStatus;
  jobOpportunityPushConsent: 'any' | 'accepted' | 'not_accepted';
  practices: PracticeArea[];
  assignedFirmIds: string[];
  preferredCities: CityOption[];
  jdYears: string[];
};

export const DEFAULT_STAFF_CANDIDATE_FILTERS: StaffCandidateFilters = {
  assignedRecruiter: 'any',
  currentStatus: 'any',
  jobOpportunityPushConsent: 'any',
  practices: [],
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
