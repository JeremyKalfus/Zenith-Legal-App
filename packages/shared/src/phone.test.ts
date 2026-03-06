import { describe, expect, it } from 'vitest';
import { formatPhoneForDisplay, normalizePhoneNumber } from './phone';

describe('normalizePhoneNumber', () => {
  it('defaults US 10-digit numbers to +1', () => {
    expect(normalizePhoneNumber('2028347778')).toEqual({
      ok: true,
      e164: '+12028347778',
    });
  });

  it('normalizes 11-digit US numbers starting with 1', () => {
    expect(normalizePhoneNumber('12028347778')).toEqual({
      ok: true,
      e164: '+12028347778',
    });
  });

  it('preserves canonical US E.164 numbers', () => {
    expect(normalizePhoneNumber('+12028347778')).toEqual({
      ok: true,
      e164: '+12028347778',
    });
  });

  it('preserves explicit international + numbers', () => {
    expect(normalizePhoneNumber('+44 20 7946 0958')).toEqual({
      ok: true,
      e164: '+442079460958',
    });
  });

  it('rejects invalid short inputs', () => {
    expect(normalizePhoneNumber('123')).toMatchObject({ ok: false });
  });

  it('rejects characters-only input', () => {
    expect(normalizePhoneNumber('abc')).toMatchObject({ ok: false });
  });

  it('rejects malformed plus usage', () => {
    expect(normalizePhoneNumber('++1202')).toMatchObject({ ok: false });
  });
});

describe('formatPhoneForDisplay', () => {
  it('formats US E.164 numbers to local display format', () => {
    expect(formatPhoneForDisplay('+12024868858')).toBe('(202) 486-8858');
  });

  it('passes through already formatted numbers', () => {
    expect(formatPhoneForDisplay('(202) 486-3535')).toBe('(202) 486-3535');
  });

  it('falls back to canonical non-US international number format', () => {
    expect(formatPhoneForDisplay('+442079460958')).toBe('+442079460958');
  });
});
