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
  invalid_status_transition: 'This appointment cannot be changed in its current state.',
  invalid_action: 'That appointment action is not valid.',
  forbidden_action: 'You are not allowed to perform that appointment action.',
  status_update_failed: 'Unable to update the status. Please try again.',
  role_already_set: 'This account already has that role.',
  role_update_forbidden: 'Only candidate accounts can be promoted from this workflow.',
  role_update_failed: 'Unable to update the account role. Please try again.',
};

function isResponseLike(
  value: unknown,
): value is { json: () => Promise<unknown>; text?: () => Promise<string>; clone?: () => Response } {
  return (
    value != null &&
    typeof (value as { json?: unknown }).json === 'function'
  );
}

async function parseResponseBody(
  responseLike: { json: () => Promise<unknown>; text?: () => Promise<string>; clone?: () => Response },
): Promise<FunctionErrorPayload | null> {
  const cloneFn = typeof responseLike.clone === 'function' ? responseLike.clone.bind(responseLike) : null;
  const forJson = cloneFn ? cloneFn() : responseLike;
  const forText = cloneFn ? cloneFn() : responseLike;
  try {
    const raw = await forJson.json();
    return raw as FunctionErrorPayload;
  } catch {
    try {
      if (typeof forText.text === 'function') {
        const text = await forText.text();
        return JSON.parse(text) as FunctionErrorPayload;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function getFunctionErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): Promise<string> {
  const errorObject = error as {
    message?: string;
    context?: unknown;
    response?: unknown;
  } | null;

  const responseLike = errorObject?.context ?? errorObject?.response;
  if (isResponseLike(responseLike)) {
    const payload = await parseResponseBody(responseLike);
    if (payload?.code && payload.code in ERROR_CODE_MESSAGES) {
      return ERROR_CODE_MESSAGES[payload.code];
    }
    if (typeof payload?.error === 'string') {
      return payload.error;
    }
  }

  return errorObject?.message ?? fallback;
}
