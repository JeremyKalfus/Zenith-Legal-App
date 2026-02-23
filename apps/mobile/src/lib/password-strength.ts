export type PasswordStrengthLevel = 'weak' | 'fair' | 'good' | 'strong';

export type PasswordStrength = {
  score: number;
  level: PasswordStrengthLevel;
  label: string;
  helperText: string;
  color: string;
};

const COMMON_PASSWORD_HINTS = ['password', '123456', 'qwerty', 'letmein', 'welcome'] as const;

// UX-only estimator for inline feedback. This is not a security guarantee or password policy.
export function getPasswordStrength(password: string): PasswordStrength | null {
  if (!password) {
    return null;
  }

  const value = password.trim();
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();
  let score = 0;

  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  const varietyCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (value.length >= 16) score += 1;

  if (varietyCount >= 2) score += 1;
  if (varietyCount >= 3) score += 1;
  if (varietyCount >= 4) score += 1;

  if (/^(.)\1+$/.test(value)) {
    score = Math.max(0, score - 3);
  }
  if (/(.)\1\1/.test(value)) {
    score = Math.max(0, score - 1);
  }
  if (COMMON_PASSWORD_HINTS.some((hint) => lower.includes(hint))) {
    score = Math.max(0, score - 2);
  }
  if (value.length < 6) {
    score = Math.min(score, 1);
  }

  const normalizedScore = Math.max(0, Math.min(score, 4));

  if (normalizedScore <= 1) {
    return {
      score: normalizedScore,
      level: 'weak',
      label: 'Weak',
      helperText: 'Use a longer password with a mix of letters, numbers, and symbols.',
      color: '#DC2626',
    };
  }

  if (normalizedScore === 2) {
    return {
      score: normalizedScore,
      level: 'fair',
      label: 'Fair',
      helperText: 'Add more length or character variety to strengthen it.',
      color: '#D97706',
    };
  }

  if (normalizedScore === 3) {
    return {
      score: normalizedScore,
      level: 'good',
      label: 'Good',
      helperText: 'Solid password. More length makes it even stronger.',
      color: '#0891B2',
    };
  }

  return {
    score: normalizedScore,
    level: 'strong',
    label: 'Strong',
    helperText: 'Strong password choice.',
    color: '#0F766E',
  };
}
