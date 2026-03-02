import type { CandidateIntake, CityOption, FirmStatus, PracticeArea } from '@zenith/shared';

export type CandidateProfile = {
  id: string;
  role: 'candidate' | 'staff';
  name: string | null;
  email: string;
  mobile: string | null;
  jd_degree_date: string | null;
  onboarding_complete: boolean;
  preferredCities: CityOption[];
  otherCityText: string | null;
  practiceAreas: PracticeArea[];
  otherPracticeText: string | null;
  acceptedPrivacyPolicy: boolean;
  acceptedCommunicationConsent: boolean;
};

export type CandidateFirmAssignment = {
  id: string;
  firm_id: string;
  status_enum: FirmStatus;
  status_updated_at: string;
  firms: {
    id: string;
    name: string;
  };
};

export type IntakeDraft = CandidateIntake;

export type RecruiterContact = {
  phone: string;
  email: string;
};
