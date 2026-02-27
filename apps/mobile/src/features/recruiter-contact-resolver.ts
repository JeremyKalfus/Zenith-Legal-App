import type { RecruiterContact } from '../types/domain';

type ResolveRecruiterContactInput = {
  defaultContact: RecruiterContact;
  globalContact?: RecruiterContact | null;
  candidateOverride?: RecruiterContact | null;
};

function isValidContact(contact: RecruiterContact | null | undefined): contact is RecruiterContact {
  return Boolean(contact?.phone?.trim() && contact?.email?.trim());
}

export function resolveRecruiterContact(input: ResolveRecruiterContactInput): RecruiterContact {
  if (isValidContact(input.candidateOverride)) {
    return input.candidateOverride;
  }

  if (isValidContact(input.globalContact)) {
    return input.globalContact;
  }

  return input.defaultContact;
}

