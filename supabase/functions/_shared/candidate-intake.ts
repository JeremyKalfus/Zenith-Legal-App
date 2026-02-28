import { z } from 'npm:zod@4.3.6';
import { normalizeUsPhoneForAuth } from './phone.ts';

export const PRIVACY_POLICY_VERSION = Deno.env.get('CONSENT_PRIVACY_POLICY_VERSION') ?? 'v1';
export const COMMUNICATION_CONSENT_VERSION =
  Deno.env.get('CONSENT_COMMUNICATION_CONSENT_VERSION') ?? 'v1';

export const cityOptions = [
  'DC',
  'NYC',
  'Boston',
  'Houston',
  'Dallas',
  'Chicago',
  'Atlanta',
  'Charlotte',
  'LA / Southern Cal',
  'SF / Northern Cal',
  'Miami',
  'Denver',
  'Philadelphia',
  'Seattle',
  'Other',
] as const;

export const practiceAreas = [
  'Antitrust',
  'White Collar',
  'Gov Contracts',
  'SEC / CFTC',
  'IP / Tech Trans',
  'Labor & Employment',
  'Litigation',
  'Corp: M&A/PE',
  'Corp: Finance',
  'Corp: EC/VC',
  'Corp: Cap Mkts',
  'Real Estate',
  'Tax & Benefits',
  'Media/Ent',
  "Int'l arb",
  "Int'l reg",
  'Other',
] as const;

function optionalTrimmedString(max: number) {
  return z
    .string()
    .max(max)
    .optional()
    .transform((input) => {
      if (typeof input !== 'string') {
        return undefined;
      }
      const trimmed = input.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    });
}

function optionalIsoDateString() {
  return z
    .string()
    .optional()
    .transform((input) => {
      if (typeof input !== 'string') {
        return undefined;
      }
      const trimmed = input.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    })
    .refine((value) => {
      if (!value) {
        return true;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
      }
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        return false;
      }
      return parsed.toISOString().slice(0, 10) === value;
    }, 'jdDegreeDate must be a valid date in YYYY-MM-DD format');
}

const optionalMobileInputSchema = z
  .string()
  .max(30)
  .optional()
  .transform((input) => {
    if (typeof input !== 'string') {
      return undefined;
    }
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

export const candidateIntakeSchema = z
  .object({
    name: optionalTrimmedString(120),
    email: z.string().trim().email().max(255),
    mobile: optionalMobileInputSchema,
    preferredCities: z.array(z.enum(cityOptions)).default([]),
    otherCityText: optionalTrimmedString(120),
    practiceAreas: z.array(z.enum(practiceAreas)).max(3).default([]),
    otherPracticeText: optionalTrimmedString(120),
    jdDegreeDate: optionalIsoDateString(),
    acceptedPrivacyPolicy: z.boolean(),
    acceptedCommunicationConsent: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!value.acceptedPrivacyPolicy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'acceptedPrivacyPolicy must be true',
        path: ['acceptedPrivacyPolicy'],
      });
    }

    if (!value.acceptedCommunicationConsent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'acceptedCommunicationConsent must be true',
        path: ['acceptedCommunicationConsent'],
      });
    }

    if (value.preferredCities.includes('Other') && !value.otherCityText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'otherCityText is required when Other city is selected',
        path: ['otherCityText'],
      });
    }

    if (value.practiceAreas.includes('Other') && !value.otherPracticeText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'otherPracticeText is required when practice area is Other',
        path: ['otherPracticeText'],
      });
    }
  });

export const candidateRegistrationSchema = candidateIntakeSchema.extend({
  password: z.string().min(6).max(256),
});

export type CandidateIntakePayload = z.infer<typeof candidateIntakeSchema>;

function isMissingUsersProfileColumnError(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    (lowered.includes('users_profile.jd_degree_date') && lowered.includes('does not exist')) ||
    lowered.includes('column "jd_degree_date" does not exist')
  );
}

export function normalizeCandidateMobileForRegistration(input: string): string {
  try {
    return normalizeUsPhoneForAuth(input);
  } catch {
    throw new Error('Enter a valid mobile number. US numbers can be entered without +1.');
  }
}

type PersistCandidateIntakeParams = {
  client: {
    from: (table: string) => any;
  };
  userId: string;
  role: 'candidate' | 'staff';
  intake: CandidateIntakePayload;
  source: string;
  upsertConsentsOnlyWhenChanged?: boolean;
  onboardingComplete?: boolean;
};

export async function persistCandidateIntakeData({
  client,
  userId,
  role,
  intake,
  source,
  upsertConsentsOnlyWhenChanged = false,
  onboardingComplete = true,
}: PersistCandidateIntakeParams) {
  const fullProfilePayload = {
    id: userId,
    role,
    name: intake.name ?? null,
    email: intake.email,
    mobile: intake.mobile ?? null,
    jd_degree_date: intake.jdDegreeDate ?? null,
    onboarding_complete: onboardingComplete,
  };
  const legacyProfilePayload = {
    id: userId,
    role,
    name: intake.name ?? null,
    email: intake.email,
    mobile: intake.mobile ?? null,
    onboarding_complete: onboardingComplete,
  };

  let upsertProfile = await client.from('users_profile').upsert(
    fullProfilePayload,
    { onConflict: 'id' },
  );

  if (upsertProfile.error && isMissingUsersProfileColumnError(upsertProfile.error.message ?? '')) {
    upsertProfile = await client.from('users_profile').upsert(
      legacyProfilePayload,
      { onConflict: 'id' },
    );
  }

  if (upsertProfile.error) {
    throw new Error(`profile_insert_failed:${upsertProfile.error.message}`);
  }

  const upsertPreferences = await client.from('candidate_preferences').upsert(
    {
      user_id: userId,
      cities: intake.preferredCities,
      other_city_text: intake.otherCityText || null,
      practice_areas: intake.practiceAreas,
      practice_area: intake.practiceAreas[0] ?? null,
      other_practice_text: intake.otherPracticeText || null,
    },
    { onConflict: 'user_id' },
  );
  if (upsertPreferences.error) {
    throw new Error(`preferences_insert_failed:${upsertPreferences.error.message}`);
  }

  if (upsertConsentsOnlyWhenChanged) {
    const { data: existingConsents, error: existingConsentsError } = await client
      .from('candidate_consents')
      .select(
        'privacy_policy_accepted,privacy_policy_version,communication_consent_accepted,communication_consent_version',
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (existingConsentsError) {
      throw new Error(`consent_lookup_failed:${existingConsentsError.message}`);
    }

    const shouldUpsertConsents =
      !existingConsents ||
      existingConsents.privacy_policy_accepted !== intake.acceptedPrivacyPolicy ||
      existingConsents.communication_consent_accepted !== intake.acceptedCommunicationConsent ||
      (intake.acceptedPrivacyPolicy && !existingConsents.privacy_policy_version) ||
      (intake.acceptedCommunicationConsent && !existingConsents.communication_consent_version);

    if (!shouldUpsertConsents) {
      return;
    }
  }

  const consentAcceptedAt = new Date().toISOString();
  const upsertConsents = await client.from('candidate_consents').upsert(
    {
      user_id: userId,
      privacy_policy_accepted: intake.acceptedPrivacyPolicy,
      privacy_policy_accepted_at: intake.acceptedPrivacyPolicy ? consentAcceptedAt : null,
      privacy_policy_version: intake.acceptedPrivacyPolicy ? PRIVACY_POLICY_VERSION : null,
      communication_consent_accepted: intake.acceptedCommunicationConsent,
      communication_consent_accepted_at: intake.acceptedCommunicationConsent ? consentAcceptedAt : null,
      communication_consent_version: intake.acceptedCommunicationConsent
        ? COMMUNICATION_CONSENT_VERSION
        : null,
      source,
    },
    { onConflict: 'user_id' },
  );
  if (upsertConsents.error) {
    throw new Error(`consents_insert_failed:${upsertConsents.error.message}`);
  }
}
