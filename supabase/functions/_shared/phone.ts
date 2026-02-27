export function sanitizePhoneInput(value: string): string {
  const trimmed = value.trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function normalizeUsPhoneForAuth(input: string): string {
  const sanitized = sanitizePhoneInput(input);
  if (!sanitized) {
    throw new Error('invalid_identifier');
  }

  if (sanitized.startsWith('00')) {
    return normalizeUsPhoneForAuth(`+${sanitized.slice(2)}`);
  }

  let candidate = sanitized;
  if (!candidate.startsWith('+')) {
    if (/^\d{10}$/.test(candidate)) {
      candidate = `+1${candidate}`;
    } else if (/^1\d{10}$/.test(candidate)) {
      candidate = `+${candidate}`;
    } else {
      throw new Error('invalid_identifier');
    }
  }

  if (!isE164Phone(candidate)) {
    throw new Error('invalid_identifier');
  }

  return candidate;
}
