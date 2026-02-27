import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { clearNonCascadingUserReferences } from '../_shared/user-cleanup.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

Deno.serve(
  createEdgeHandler(
    async ({ userId }) => {
      const resolvedUserId = userId as string;
      const serviceClient = createServiceClient();

      const { data: targetProfile, error: profileError } = await serviceClient
        .from('users_profile')
        .select('id,role,name,email,mobile,onboarding_complete,created_at,updated_at')
        .eq('id', resolvedUserId)
        .maybeSingle();

      if (profileError) {
        return errorResponse(profileError.message, 400, 'user_lookup_failed');
      }

      if (!targetProfile) {
        return errorResponse('User profile not found.', 404, 'user_not_found');
      }

      if (targetProfile.role !== 'candidate') {
        return errorResponse(
          'In-app account deletion is only available for candidate accounts.',
          403,
          'delete_role_forbidden',
        );
      }

      await clearNonCascadingUserReferences(serviceClient, resolvedUserId);

      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(resolvedUserId);
      if (deleteError) {
        return errorResponse(deleteError.message, 500, 'user_delete_failed');
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId: null,
        action: 'candidate_delete_own_account',
        entityType: 'users_profile',
        entityId: resolvedUserId,
        beforeJson: targetProfile as unknown as Record<string, unknown>,
        afterJson: {
          deleted_by: 'self',
        },
      });

      return jsonResponse({
        success: true,
        deleted_user_id: resolvedUserId,
        deleted_role: 'candidate',
      });
    },
    { auth: 'user' },
  ),
);
