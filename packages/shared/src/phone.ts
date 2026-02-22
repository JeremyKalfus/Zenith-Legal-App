export const PHONE_VALIDATION_MESSAGES = {
  invalidMobile:
    'Enter a valid mobile number (include area code; US numbers default to +1).',
  invalidMobileForAuth: 'Enter a valid mobile number. US numbers can be entered without +1.',
} as const;

type NormalizePhoneOptions = {
  defaultCountryCode?: '1';
};

export type NormalizePhoneSuccess = {
  ok: true;
  e164: string;
};

export type NormalizePhoneFailure = {
  ok: false;
  reason: string;
};

export type NormalizePhoneResult = NormalizePhoneSuccess | NormalizePhoneFailure;

export function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function sanitizePhoneInput(value: string): string {
  const trimmed = value.trim();
  let result = '';
  for (const character of trimmed) {
    if (character >= '0' && character <= '9') {
      result += character;
      continue;
    }

    if (character === '+' && result.length === 0) {
      result = '+';
    }
  }
  return result;
}

export function normalizePhoneNumber(
  input: string,
  options?: NormalizePhoneOptions,
): NormalizePhoneResult {
  const defaultCountryCode = options?.defaultCountryCode ?? '1';
  const sanitized = sanitizePhoneInput(input);

  if (!sanitized) {
    return { ok: false, reason: 'Phone number is empty' };
  }

  if (sanitized.startsWith('00')) {
    const converted = `+${sanitized.slice(2)}`;
    return normalizePhoneNumber(converted, options);
  }

  let candidate = sanitized;

  if (!candidate.startsWith('+')) {
    if (/^\d{10}$/.test(candidate)) {
      candidate = `+${defaultCountryCode}${candidate}`;
    } else if (/^1\d{10}$/.test(candidate) && defaultCountryCode === '1') {
      candidate = `+${candidate}`;
    } else {
      return { ok: false, reason: 'Phone number must include country code or be a valid US number' };
    }
  }

  if (!isE164Phone(candidate)) {
    return { ok: false, reason: 'Phone number is not valid E.164 format' };
  }

  return { ok: true, e164: candidate };
}
