import { describe, expect, it } from 'vitest';
import {
  appointmentSchema,
  appointmentReviewSchema,
  APPOINTMENT_STATUSES,
  candidateIntakeSchema,
  candidateRegistrationSchema,
  FIRM_STATUSES,
} from './domain';

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

describe('appointment statuses', () => {
  it('has the expected values in order', () => {
    expect(APPOINTMENT_STATUSES).toEqual([
      'pending',
      'scheduled',
      'accepted',
      'declined',
      'cancelled',
    ]);
  });
});

describe('appointment schema', () => {
  const validInput = {
    title: 'Intro call',
    modality: 'virtual' as const,
    videoUrl: 'https://zoom.us/j/123',
    startAtUtc: '2026-03-01T14:00:00.000Z',
    endAtUtc: '2026-03-01T15:00:00.000Z',
    timezoneLabel: 'America/New_York',
  };

  it('accepts valid virtual appointment', () => {
    const result = appointmentSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts valid in-person appointment', () => {
    const result = appointmentSchema.safeParse({
      ...validInput,
      modality: 'in_person',
      videoUrl: undefined,
      locationText: '123 Main St',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing title', () => {
    const result = appointmentSchema.safeParse({ ...validInput, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects endAtUtc before startAtUtc', () => {
    const result = appointmentSchema.safeParse({
      ...validInput,
      endAtUtc: '2026-03-01T13:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.endAtUtc?.[0]).toContain('after start time');
    }
  });

  it('rejects virtual appointment without videoUrl', () => {
    const result = appointmentSchema.safeParse({
      ...validInput,
      videoUrl: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.videoUrl?.[0]).toContain('video URL');
    }
  });

  it('rejects in-person appointment without locationText', () => {
    const result = appointmentSchema.safeParse({
      ...validInput,
      modality: 'in_person',
      videoUrl: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.locationText?.[0]).toContain('location');
    }
  });

  it('rejects missing timezoneLabel', () => {
    const result = appointmentSchema.safeParse({
      ...validInput,
      timezoneLabel: '',
    });
    expect(result.success).toBe(false);
  });

  it('allows optional description', () => {
    const result = appointmentSchema.parse({
      ...validInput,
      description: 'Discuss case details',
    });
    expect(result.description).toBe('Discuss case details');
  });
});

describe('appointment review schema', () => {
  it('accepts valid accepted review', () => {
    const result = appointmentReviewSchema.safeParse({
      appointment_id: '550e8400-e29b-41d4-a716-446655440000',
      decision: 'accepted',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid declined review', () => {
    const result = appointmentReviewSchema.safeParse({
      appointment_id: '550e8400-e29b-41d4-a716-446655440000',
      decision: 'declined',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid decision value', () => {
    const result = appointmentReviewSchema.safeParse({
      appointment_id: '550e8400-e29b-41d4-a716-446655440000',
      decision: 'pending',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing appointment_id', () => {
    const result = appointmentReviewSchema.safeParse({
      decision: 'accepted',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid appointment_id', () => {
    const result = appointmentReviewSchema.safeParse({
      appointment_id: 'not-a-uuid',
      decision: 'accepted',
    });
    expect(result.success).toBe(false);
  });
});
