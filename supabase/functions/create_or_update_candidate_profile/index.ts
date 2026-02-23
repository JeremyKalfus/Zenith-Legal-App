import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const PRIVACY_POLICY_VERSION = Deno.env.get('CONSENT_PRIVACY_POLICY_VERSION') ?? 'v1';
const COMMUNICATION_CONSENT_VERSION = Deno.env.get('CONSENT_COMMUNICATION_CONSENT_VERSION') ?? 'v1';

const cityOptions = [
  'DC',
  'NYC',
  'Boston',
  'Houston',
  'Dallas',
  'Chicago',
  'LA / Southern Cal',
  'SF / Northern Cal',
  'Miami',
  'Denver',
  'Philadelphia',
  'Seattle',
  'Other',
] as const;

const practiceAreas = [
  'Antitrust',
  'Regulatory / White Collar',
  'Labor & Employment',
  'General Litigation',
  'Corporate: M&A/PE',
  'Corporate: Finance',
  'Real Estate',
  'Tax & Benefits',
  'Other',
] as const;

function optionalTrimmedString(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional()
    .transform((value) => value ?? undefined);
}

const optionalMobileInputSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional()
  .transform((value) => value ?? undefined);

const candidateIntakeSchema = z
  .object({
    name: optionalTrimmedString(120),
    email: z.string().trim().email().max(255),
    mobile: optionalMobileInputSchema,
    preferredCities: z.array(z.enum(cityOptions)).default([]),
    otherCityText: optionalTrimmedString(120),
    practiceArea: z.enum(practiceAreas).optional(),
    otherPracticeText: optionalTrimmedString(120),
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

    if (value.practiceArea === 'Other' && !value.otherPracticeText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'otherPracticeText is required when practice area is Other',
        path: ['otherPracticeText'],
      });
    }
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const userId = await getCurrentUserId(authHeader);
    const client = createAuthedClient(authHeader);
    const serviceClient = createServiceClient();

    const payload = await request.json();
    const parsed = candidateIntakeSchema.safeParse(payload);

    if (!parsed.success) {
      return errorResponse(parsed.error.flatten().formErrors.join(', ') || 'Invalid payload', 422);
    }

    const intake = parsed.data;
    const consentAcceptedAt = new Date().toISOString();

    const { data: existingProfile } = await serviceClient
      .from('users_profile')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const role = existingProfile?.role === 'staff' ? 'staff' : 'candidate';

    const upsertProfile = await client.from('users_profile').upsert(
      {
        id: userId,
        role,
        name: intake.name ?? null,
        email: intake.email,
        mobile: intake.mobile ?? null,
        onboarding_complete: true,
      },
      { onConflict: 'id' },
    );

    if (upsertProfile.error) {
      return errorResponse(upsertProfile.error.message, 400);
    }

    const upsertPreferences = await client.from('candidate_preferences').upsert(
      {
        user_id: userId,
        cities: intake.preferredCities,
        other_city_text: intake.otherCityText || null,
        practice_area: intake.practiceArea ?? null,
        other_practice_text: intake.otherPracticeText || null,
      },
      { onConflict: 'user_id' },
    );

    if (upsertPreferences.error) {
      return errorResponse(upsertPreferences.error.message, 400);
    }

    const { data: existingConsents, error: existingConsentsError } = await client
      .from('candidate_consents')
      .select(
        'privacy_policy_accepted,privacy_policy_version,communication_consent_accepted,communication_consent_version',
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (existingConsentsError) {
      return errorResponse(existingConsentsError.message, 400);
    }

    const shouldUpsertConsents =
      !existingConsents ||
      existingConsents.privacy_policy_accepted !== intake.acceptedPrivacyPolicy ||
      existingConsents.communication_consent_accepted !== intake.acceptedCommunicationConsent ||
      (intake.acceptedPrivacyPolicy && !existingConsents.privacy_policy_version) ||
      (intake.acceptedCommunicationConsent && !existingConsents.communication_consent_version);

    if (shouldUpsertConsents) {
      const upsertConsents = await client.from('candidate_consents').upsert(
        {
          user_id: userId,
          privacy_policy_accepted: intake.acceptedPrivacyPolicy,
          privacy_policy_accepted_at: intake.acceptedPrivacyPolicy ? consentAcceptedAt : null,
          privacy_policy_version: intake.acceptedPrivacyPolicy ? PRIVACY_POLICY_VERSION : null,
          communication_consent_accepted: intake.acceptedCommunicationConsent,
          communication_consent_accepted_at: intake.acceptedCommunicationConsent
            ? consentAcceptedAt
            : null,
          communication_consent_version: intake.acceptedCommunicationConsent
            ? COMMUNICATION_CONSENT_VERSION
            : null,
          source: 'mobile_app',
        },
        { onConflict: 'user_id' },
      );

      if (upsertConsents.error) {
        return errorResponse(upsertConsents.error.message, 400);
      }
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: userId,
      action: 'candidate_intake_upsert',
      entityType: 'users_profile',
      entityId: userId,
      afterJson: {
        onboarding_complete: true,
        email: intake.email,
        mobile: intake.mobile,
        consent_versions: {
          privacy_policy_version: PRIVACY_POLICY_VERSION,
          communication_consent_version: COMMUNICATION_CONSENT_VERSION,
        },
      },
    });

    return jsonResponse({
      success: true,
      user_id: userId,
      onboarding_complete: true,
    });
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }
});
