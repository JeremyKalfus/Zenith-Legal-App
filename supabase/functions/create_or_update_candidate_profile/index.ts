import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

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

const candidateIntakeSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    mobile: z.string().trim().min(7).max(30),
    preferredCities: z.array(z.enum(cityOptions)).default([]),
    otherCityText: z.string().trim().max(120).optional(),
    practiceArea: z.enum(practiceAreas),
    otherPracticeText: z.string().trim().max(120).optional(),
    acceptedPrivacyPolicy: z.boolean(),
    acceptedCommunicationConsent: z.boolean(),
  })
  .superRefine((value, ctx) => {
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
        name: intake.name,
        email: intake.email,
        mobile: intake.mobile,
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
        practice_area: intake.practiceArea,
        other_practice_text: intake.otherPracticeText || null,
      },
      { onConflict: 'user_id' },
    );

    if (upsertPreferences.error) {
      return errorResponse(upsertPreferences.error.message, 400);
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
