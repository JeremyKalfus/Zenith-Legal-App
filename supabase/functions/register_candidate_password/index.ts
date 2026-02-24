import { z } from 'npm:zod@4.3.6';
import { createServiceClient } from '../_shared/supabase.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
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

const practiceAreas = [
  'Antitrust',
  'White Collar',
  "Int'l arb",
  "Int'l reg",
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

function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function sanitizePhoneInput(value: string): string {
  const trimmed = value.trim();
  let result = '';
  for (const character of trimmed) {
    if (character >= '0' && character <= '9') {
      result += character;
      continue;
    }
    if (character === '+' && result.length === 0) {
      result = '+';
    }
  }
  return result;
}

function normalizePhoneNumber(input: string): string {
  const sanitized = sanitizePhoneInput(input);
  if (!sanitized) {
    throw new Error('Enter a valid mobile number. US numbers can be entered without +1.');
  }

  if (sanitized.startsWith('00')) {
    return normalizePhoneNumber(`+${sanitized.slice(2)}`);
  }

  let candidate = sanitized;
  if (!candidate.startsWith('+')) {
    if (/^\d{10}$/.test(candidate)) {
      candidate = `+1${candidate}`;
    } else if (/^1\d{10}$/.test(candidate)) {
      candidate = `+${candidate}`;
    } else {
      throw new Error('Enter a valid mobile number. US numbers can be entered without +1.');
    }
  }

  if (!isE164Phone(candidate)) {
    throw new Error('Enter a valid mobile number. US numbers can be entered without +1.');
  }

  return candidate;
}

const registrationSchema = z
  .object({
    name: optionalTrimmedString(120),
    email: z.string().trim().email().max(255),
    mobile: optionalMobileInputSchema,
    preferredCities: z.array(z.enum(cityOptions)).default([]),
    otherCityText: optionalTrimmedString(120),
    practiceAreas: z.array(z.enum(practiceAreas)).max(3).default([]),
    otherPracticeText: optionalTrimmedString(120),
    acceptedPrivacyPolicy: z.boolean(),
    acceptedCommunicationConsent: z.boolean(),
    password: z.string().min(6).max(256),
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

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function passwordGrant(params: { email: string; password: string }) {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: anonKey,
  };

  if (!anonKey.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${anonKey}`;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: params.email, password: params.password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = typeof payload?.msg === 'string'
      ? payload.msg
      : typeof payload?.error_description === 'string'
      ? payload.error_description
      : typeof payload?.error === 'string'
      ? payload.error
      : 'Invalid credentials';
    throw new Error(errorMessage);
  }

  return payload;
}

function structuredError(code: string, message: string, status: number): Response {
  return jsonResponse({ ok: false, code, error: message }, status);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const serviceClient = createServiceClient();
  let createdUserId: string | null = null;

  try {
    const payload = await request.json();
    const parsed = registrationSchema.safeParse(payload);
    if (!parsed.success) {
      return structuredError(
        'validation_error',
        parsed.error.flatten().formErrors.join(', ') || 'Invalid payload',
        422,
      );
    }

    const intake = parsed.data;
    const email = intake.email.trim().toLowerCase();
    const mobile = intake.mobile ? normalizePhoneNumber(intake.mobile) : null;
    const consentAcceptedAt = new Date().toISOString();

    if (mobile) {
      const { data: existingMobileProfile, error: mobileLookupError } = await serviceClient
        .from('users_profile')
        .select('id')
        .eq('mobile', mobile)
        .maybeSingle();

      if (mobileLookupError) {
        return structuredError('database_error', 'Unable to validate mobile number', 500);
      }
      if (existingMobileProfile) {
        return structuredError(
          'duplicate_mobile',
          'An account with this mobile number already exists. Sign in or reset your password.',
          409,
        );
      }
    }

    const { data: existingEmailProfile, error: emailLookupError } = await serviceClient
      .from('users_profile')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    if (emailLookupError) {
      return structuredError('database_error', 'Unable to validate email address', 500);
    }
    if (existingEmailProfile) {
      return structuredError(
        'duplicate_email',
        'An account with this email already exists. Sign in or reset your password.',
        409,
      );
    }

    const createUser = await serviceClient.auth.admin.createUser({
      email,
      password: intake.password,
      email_confirm: true,
      user_metadata: {
        source: 'mobile_registration',
      },
    });

    if (createUser.error || !createUser.data.user) {
      const errorText = createUser.error?.message ?? 'Unable to create account';
      if (errorText.toLowerCase().includes('already')) {
        const { data: existingEmailProfileAfterCreate, error: existingEmailProfileAfterCreateError } =
          await serviceClient.from('users_profile').select('id').ilike('email', email).maybeSingle();

        if (!existingEmailProfileAfterCreateError && !existingEmailProfileAfterCreate) {
          return structuredError(
            'account_exists_auth_only',
            'This email already exists but your profile setup is incomplete. Sign in or reset your password.',
            409,
          );
        }

        return structuredError(
          'duplicate_email',
          'An account with this email already exists. Sign in or reset your password.',
          409,
        );
      }
      return structuredError('auth_create_failed', errorText, 400);
    }

    createdUserId = createUser.data.user.id;

    const upsertProfile = await serviceClient.from('users_profile').upsert(
      {
        id: createdUserId,
        role: 'candidate',
        name: intake.name ?? null,
        email,
        mobile,
        onboarding_complete: true,
      },
      { onConflict: 'id' },
    );

    if (upsertProfile.error) {
      throw new Error(`profile_insert_failed:${upsertProfile.error.message}`);
    }

    const upsertPreferences = await serviceClient.from('candidate_preferences').upsert(
      {
        user_id: createdUserId,
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

    const upsertConsents = await serviceClient.from('candidate_consents').upsert(
      {
        user_id: createdUserId,
        privacy_policy_accepted: intake.acceptedPrivacyPolicy,
        privacy_policy_accepted_at: consentAcceptedAt,
        privacy_policy_version: PRIVACY_POLICY_VERSION,
        communication_consent_accepted: intake.acceptedCommunicationConsent,
        communication_consent_accepted_at: consentAcceptedAt,
        communication_consent_version: COMMUNICATION_CONSENT_VERSION,
        source: 'mobile_app',
      },
      { onConflict: 'user_id' },
    );

    if (upsertConsents.error) {
      throw new Error(`consents_insert_failed:${upsertConsents.error.message}`);
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: createdUserId,
      action: 'candidate_password_registration',
      entityType: 'users_profile',
      entityId: createdUserId,
      afterJson: {
        role: 'candidate',
        onboarding_complete: true,
        email,
        mobile,
      },
    });

    const sessionPayload = await passwordGrant({ email, password: intake.password });

    return jsonResponse({
      ok: true,
      user_id: createdUserId,
      session: {
        access_token: sessionPayload.access_token,
        refresh_token: sessionPayload.refresh_token,
        expires_in: sessionPayload.expires_in,
        expires_at: sessionPayload.expires_at,
        token_type: sessionPayload.token_type,
        user: sessionPayload.user,
      },
    });
  } catch (error) {
    if (createdUserId) {
      await serviceClient.auth.admin.deleteUser(createdUserId).catch(() => {
        // best-effort rollback
      });
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    if (
      message.startsWith('profile_insert_failed:') ||
      message.startsWith('preferences_insert_failed:') ||
      message.startsWith('consents_insert_failed:')
    ) {
      const separatorIndex = message.indexOf(':');
      const stageCode =
        separatorIndex > 0 ? message.slice(0, separatorIndex) : 'registration_persistence_failed';
      return structuredError(
        stageCode,
        'Unable to save your profile. Please try again.',
        500,
      );
    }
    if (message.includes('valid mobile number')) {
      return structuredError('invalid_mobile', message, 422);
    }

    return structuredError('internal_error', message, 500);
  }
});
