import type { CandidateIntake, FirmStatus } from '@zenith/shared';

export type CandidateProfile = {
  id: string;
  role: 'candidate' | 'staff';
  name: string;
  email: string;
  mobile: string;
  onboarding_complete: boolean;
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
