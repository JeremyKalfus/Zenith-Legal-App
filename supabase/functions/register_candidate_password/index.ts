import { createServiceClient } from '../_shared/supabase.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { requestPasswordGrant, toSessionResponse } from '../_shared/password-auth.ts';
import {
  candidateRegistrationSchema,
  normalizeCandidateMobileForRegistration,
  persistCandidateIntakeData,
} from '../_shared/candidate-intake.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

async function passwordGrant(params: { email: string; password: string }) {
  const { payload, response } = await requestPasswordGrant(params);
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

function mapPersistenceFailure(errorMessage: string): Response | null {
  const separatorIndex = errorMessage.indexOf(':');
  if (separatorIndex <= 0) {
    return null;
  }
  const stageCode = errorMessage.slice(0, separatorIndex);
  if (
    stageCode === 'profile_insert_failed' ||
    stageCode === 'preferences_insert_failed' ||
    stageCode === 'consents_insert_failed'
  ) {
    return structuredError(stageCode, 'Unable to save your profile. Please try again.', 500);
  }
  return null;
}

Deno.serve(
  createEdgeHandler(
    async ({ request }) => {
      const serviceClient = createServiceClient();
      let createdUserId: string | null = null;

      try {
        const payload = await request.json();
        const parsed = candidateRegistrationSchema.safeParse(payload);
        if (!parsed.success) {
          return structuredError(
            'validation_error',
            parsed.error.flatten().formErrors.join(', ') || 'Invalid payload',
            422,
          );
        }

        const intake = parsed.data;
        const email = intake.email.trim().toLowerCase();
        const mobile = intake.mobile ? normalizeCandidateMobileForRegistration(intake.mobile) : null;

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
        await persistCandidateIntakeData({
          client: serviceClient,
          userId: createdUserId,
          role: 'candidate',
          intake: {
            ...intake,
            email,
            mobile,
          },
          source: 'mobile_app',
          upsertConsentsOnlyWhenChanged: false,
        });

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
          session: toSessionResponse(sessionPayload),
        });
      } catch (error) {
        if (createdUserId) {
          await serviceClient.auth.admin.deleteUser(createdUserId).catch(() => {
            // best-effort rollback
          });
        }

        const message = error instanceof Error ? error.message : 'Internal server error';
        const mappedPersistenceFailure = mapPersistenceFailure(message);
        if (mappedPersistenceFailure) {
          return mappedPersistenceFailure;
        }
        if (message.includes('valid mobile number')) {
          return structuredError('invalid_mobile', message, 422);
        }

        return structuredError('internal_error', message, 500);
      }
    },
    {
      method: 'POST',
      onError: (message) => errorResponse(message, 500),
    },
  ),
);
