import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import {
  candidateIntakeSchema,
  COMMUNICATION_CONSENT_VERSION,
  persistCandidateIntakeData,
  PRIVACY_POLICY_VERSION,
} from '../_shared/candidate-intake.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

function mapPersistenceFailureToResponse(message: string): Response | null {
  if (message.startsWith('consent_lookup_failed:')) {
    return errorResponse(message.slice('consent_lookup_failed:'.length), 400);
  }
  if (message.startsWith('profile_insert_failed:')) {
    return errorResponse(message.slice('profile_insert_failed:'.length), 400);
  }
  if (message.startsWith('preferences_insert_failed:')) {
    return errorResponse(message.slice('preferences_insert_failed:'.length), 400);
  }
  if (message.startsWith('consents_insert_failed:')) {
    return errorResponse(message.slice('consents_insert_failed:'.length), 400);
  }
  return null;
}

Deno.serve(
  createEdgeHandler(
    async ({ request, authHeader, userId }) => {
      const resolvedUserId = userId as string;
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
        .eq('id', resolvedUserId)
        .maybeSingle();

      const role = existingProfile?.role === 'staff' ? 'staff' : 'candidate';
      await persistCandidateIntakeData({
        client,
        userId: resolvedUserId,
        role,
        intake,
        source: 'mobile_app',
        upsertConsentsOnlyWhenChanged: true,
      });

      await writeAuditEvent({
        client: serviceClient,
        actorUserId: resolvedUserId,
        action: 'candidate_intake_upsert',
        entityType: 'users_profile',
        entityId: resolvedUserId,
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
        user_id: resolvedUserId,
        onboarding_complete: true,
      });
    },
    {
      auth: 'user',
      onError: mapPersistenceFailureToResponse,
    },
  ),
);
