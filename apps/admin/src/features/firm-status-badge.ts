import type { FirmStatus } from '@zenith/shared';

const FIRM_STATUS_BADGE_CLASSES: Record<FirmStatus, string> = {
  'Waiting on your authorization to contact/submit':
    'border-amber-200 bg-amber-100 text-amber-800',
  'Authorized, will submit soon':
    'border-teal-200 bg-teal-100 text-teal-800',
  'Submitted, waiting to hear from firm':
    'border-blue-200 bg-blue-100 text-blue-800',
  'Interview Stage':
    'border-violet-200 bg-violet-100 text-violet-800',
  'Rejected by firm':
    'border-red-200 bg-red-100 text-red-800',
  'Offer received!':
    'border-green-200 bg-green-100 text-green-800',
};

export function getFirmStatusBadgeClasses(status: FirmStatus): string {
  return FIRM_STATUS_BADGE_CLASSES[status];
}

