import { describe, expect, it } from 'vitest';
import { candidateIntakeSchema, candidateRegistrationSchema, FIRM_STATUSES } from './domain';

describe('candidate intake schema', () => {
  it('allows optional non-auth fields to be omitted', () => {
    const result = candidateIntakeSchema.parse({
      email: 'jane@example.com',
      preferredCities: [],
      acceptedPrivacyPolicy: true,
      acceptedCommunicationConsent: true,
    });

    expect(result.name).toBeUndefined();
    expect(result.mobile).toBeUndefined();
    expect(result.practiceArea).toBeUndefined();
  });

  it('requires text when city Other is selected', () => {
    const result = candidateIntakeSchema.safeParse({
      email: 'jane@example.com',
      preferredCities: ['Other'],
      acceptedPrivacyPolicy: true,
      acceptedCommunicationConsent: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.otherCityText).toBeTruthy();
    }
  });

  it('normalizes mobile to E.164 with US default country code', () => {
    const result = candidateIntakeSchema.parse({
      email: 'jane@example.com',
      mobile: '202-555-0109',
      preferredCities: [],
      acceptedPrivacyPolicy: true,
      acceptedCommunicationConsent: true,
    });

    expect(result.mobile).toBe('+12025550109');
  });

  it('rejects invalid mobile format', () => {
    const result = candidateIntakeSchema.safeParse({
      email: 'jane@example.com',
      mobile: 'abc',
      preferredCities: [],
      acceptedPrivacyPolicy: true,
      acceptedCommunicationConsent: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.mobile?.[0]).toContain('US numbers default to +1');
    }
  });

  it('keeps the exact status order and values', () => {
    expect(FIRM_STATUSES).toEqual([
      'Waiting on your authorization to contact/submit',
      'Authorized, will submit soon',
      'Submitted, waiting to hear from firm',
      'Interview Stage',
      'Rejected by firm',
      'Offer received!',
    ]);
  });
});

describe('candidate registration schema', () => {
  it('requires password and confirm password', () => {
    const result = candidateRegistrationSchema.safeParse({
      email: 'jane@example.com',
      preferredCities: [],
      acceptedPrivacyPolicy: true,
      acceptedCommunicationConsent: true,
      password: '',
      confirmPassword: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toBeTruthy();
      expect(result.error.flatten().fieldErrors.confirmPassword).toBeTruthy();
    }
  });

  it('rejects password mismatch', () => {
    const result = candidateRegistrationSchema.safeParse({
      email: 'jane@example.com',
      preferredCities: [],
      acceptedPrivacyPolicy: true,
      acceptedCommunicationConsent: true,
      password: 'password1',
      confirmPassword: 'password2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword?.[0]).toContain('Passwords do not match');
    }
  });

  it('still requires both consent checkboxes', () => {
    const result = candidateRegistrationSchema.safeParse({
      email: 'jane@example.com',
      preferredCities: [],
      acceptedPrivacyPolicy: false,
      acceptedCommunicationConsent: false,
      password: 'password1',
      confirmPassword: 'password1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.acceptedPrivacyPolicy).toBeTruthy();
      expect(result.error.flatten().fieldErrors.acceptedCommunicationConsent).toBeTruthy();
    }
  });
});
