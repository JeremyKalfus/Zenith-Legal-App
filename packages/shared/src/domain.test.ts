import { describe, expect, it } from 'vitest';
import { candidateIntakeSchema, FIRM_STATUSES } from './domain';

describe('candidate intake schema', () => {
  it('requires text when city Other is selected', () => {
    const result = candidateIntakeSchema.safeParse({
      name: 'Jane Doe',
      email: 'jane@example.com',
      mobile: '+12025550109',
      preferredCities: ['Other'],
      practiceArea: 'Antitrust',
      acceptedPrivacyPolicy: true,
      acceptedCommunicationConsent: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.otherCityText).toBeTruthy();
    }
  });

  it('keeps the exact status order and values', () => {
    expect(FIRM_STATUSES).toEqual([
      'Waiting on your authorization to contact/submit',
      'Submitted, waiting to hear from firm',
      'Interview Stage',
      'Rejected by firm',
      'Offer received!',
    ]);
  });
});
