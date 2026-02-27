import type { FirmStatus } from '@zenith/shared';
import { uiColors } from '../theme/colors';

export type FirmStatusBadgeColors = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

const FIRM_STATUS_BADGE_COLORS: Record<FirmStatus, FirmStatusBadgeColors> = {
  'Waiting on your authorization to contact/submit': {
    backgroundColor: uiColors.statusWaitingBg,
    borderColor: uiColors.statusWaitingBorder,
    textColor: uiColors.statusWaitingText,
  },
  'Authorized, will submit soon': {
    backgroundColor: uiColors.statusAuthorizedBg,
    borderColor: uiColors.statusAuthorizedBorder,
    textColor: uiColors.statusAuthorizedText,
  },
  'Submitted, waiting to hear from firm': {
    backgroundColor: uiColors.statusSubmittedBg,
    borderColor: uiColors.statusSubmittedBorder,
    textColor: uiColors.statusSubmittedText,
  },
  'Interview Stage': {
    backgroundColor: uiColors.statusInterviewBg,
    borderColor: uiColors.statusInterviewBorder,
    textColor: uiColors.statusInterviewText,
  },
  'Rejected by firm': {
    backgroundColor: uiColors.statusRejectedBg,
    borderColor: uiColors.statusRejectedBorder,
    textColor: uiColors.statusRejectedText,
  },
  'Offer received!': {
    backgroundColor: uiColors.statusOfferBg,
    borderColor: uiColors.statusOfferBorder,
    textColor: uiColors.statusOfferText,
  },
};

export function getFirmStatusBadgeColors(status: FirmStatus): FirmStatusBadgeColors {
  return FIRM_STATUS_BADGE_COLORS[status];
}

