import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import {
  clearNonCascadingUserReferences,
  reassignAppointmentsCreatedByUser,
} from '../_shared/user-cleanup.ts';
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

      if (targetProfile.role !== 'candidate' && targetProfile.role !== 'staff') {
        return errorResponse('This account role cannot be deleted in-app.', 403, 'delete_role_forbidden');
      }

      if (targetProfile.role === 'staff') {
        const { count: remainingStaffCount, error: countError } = await serviceClient
          .from('users_profile')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'staff');

        if (countError) {
          return errorResponse(countError.message, 400, 'staff_count_failed');
        }

        if ((remainingStaffCount ?? 0) <= 1) {
          return errorResponse(
            'The last remaining staff account cannot be deleted in-app.',
            403,
            'last_staff_delete_forbidden',
          );
        }

        await reassignAppointmentsCreatedByUser(serviceClient, resolvedUserId);
      }

      await clearNonCascadingUserReferences(serviceClient, resolvedUserId);

      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(resolvedUserId);
      if (deleteError) {
        return errorResponse(deleteError.message, 500, 'user_delete_failed');
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId: null,
        action: targetProfile.role === 'staff' ? 'staff_delete_own_account' : 'candidate_delete_own_account',
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
        deleted_role: targetProfile.role,
      });
    },
    { auth: 'user' },
  ),
);
