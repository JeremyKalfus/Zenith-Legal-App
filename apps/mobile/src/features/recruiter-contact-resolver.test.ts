import { describe, expect, it } from 'vitest';
import { resolveRecruiterContact } from './recruiter-contact-resolver';

const defaultContact = {
  phone: '(202) 486-3535',
  email: 'mason@zenithlegal.com',
};

describe('resolveRecruiterContact', () => {
  it('prefers candidate override when present', () => {
    expect(
      resolveRecruiterContact({
        defaultContact,
        globalContact: { phone: '(202) 555-1000', email: 'global@example.com' },
        candidateOverride: { phone: '(202) 555-9999', email: 'candidate@example.com' },
      }),
    ).toEqual({ phone: '(202) 555-9999', email: 'candidate@example.com' });
  });

  it('falls back to global contact when override is not present', () => {
    expect(
      resolveRecruiterContact({
        defaultContact,
        globalContact: { phone: '(202) 555-1000', email: 'global@example.com' },
      }),
    ).toEqual({ phone: '(202) 555-1000', email: 'global@example.com' });
  });

  it('falls back to default contact when db values are unavailable', () => {
    expect(
      resolveRecruiterContact({
        defaultContact,
        globalContact: null,
        candidateOverride: null,
      }),
    ).toEqual(defaultContact);
  });
});

