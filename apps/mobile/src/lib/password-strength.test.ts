import { describe, expect, it } from 'vitest';
import { getPasswordStrength } from './password-strength';

describe('getPasswordStrength', () => {
  it('returns null for empty values', () => {
    expect(getPasswordStrength('')).toBeNull();
    expect(getPasswordStrength('   ')).toBeNull();
  });

  it('labels short/simple passwords as weak', () => {
    const result = getPasswordStrength('123456');
    expect(result?.level).toBe('weak');
  });

  it('improves score for longer mixed passwords', () => {
    const fairish = getPasswordStrength('Password12');
    const strong = getPasswordStrength('CorrectHorseBatteryStaple#42');

    expect(fairish).not.toBeNull();
    expect(strong).not.toBeNull();
    expect((strong?.score ?? 0)).toBeGreaterThanOrEqual(fairish?.score ?? 0);
    expect(['good', 'strong']).toContain(strong?.level);
  });

  it('penalizes repeated single-character passwords', () => {
    expect(getPasswordStrength('aaaaaaaaaaaa')?.level).toBe('weak');
  });
});
