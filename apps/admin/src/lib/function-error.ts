type FunctionErrorPayload = {
  code?: string;
  error?: string;
};

const ERROR_CODE_MESSAGES: Record<string, string> = {
  duplicate_assignment: 'This firm is already assigned to this candidate.',
  assignment_not_found: 'That assignment could not be found. Refresh and try again.',
  candidate_not_found: 'The selected candidate could not be found.',
  firm_not_found: 'The selected firm could not be found.',
  firm_inactive: 'That firm is inactive and cannot be assigned.',
  appointment_not_found: 'That appointment could not be found. Refresh and try again.',
  appointment_conflict: 'Scheduling this appointment would create a scheduling conflict.',
  invalid_status_transition: 'This appointment cannot be reviewed in its current state.',
  status_update_failed: 'Unable to update the status. Please try again.',
};

export async function getFunctionErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): Promise<string> {
  const errorObject = error as {
    message?: string;
    context?: { json?: () => Promise<unknown> };
  } | null;

  if (errorObject?.context?.json) {
    try {
      const payload = (await errorObject.context.json()) as FunctionErrorPayload;

      if (payload.code && payload.code in ERROR_CODE_MESSAGES) {
        return ERROR_CODE_MESSAGES[payload.code];
      }

      if (typeof payload.error === 'string') {
        return payload.error;
      }
    } catch {
      // fall through
    }
  }

  return errorObject?.message ?? fallback;
}
