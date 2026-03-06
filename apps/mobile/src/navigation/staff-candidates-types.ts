import type { StaffCandidateListItem } from '../features/staff-candidate-management';
import type {
  StaffCandidateFilterOptions,
  StaffCandidateFilters,
} from '../screens/staff/staff-candidate-filtering';

export type StaffCandidatesStackParamList = {
  StaffCandidatesList: {
    appliedFilters?: StaffCandidateFilters;
  } | undefined;
  StaffCandidateFirms: {
    candidate: StaffCandidateListItem;
  };
  StaffCandidateFilters: {
    initialFilters: StaffCandidateFilters;
    options: StaffCandidateFilterOptions;
    candidates: StaffCandidateListItem[];
    query: string;
  };
};
