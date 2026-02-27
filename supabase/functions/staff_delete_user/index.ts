import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { clearNonCascadingUserReferences } from '../_shared/user-cleanup.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const deleteUserSchema = z.object({
  user_id: z.string().uuid(),
});


Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const actorUserId = userId as string;
      const serviceClient = createServiceClient();
      const parsedBody = deleteUserSchema.safeParse(await request.json());
      if (!parsedBody.success) {
        return errorResponse('Invalid payload', 422, 'invalid_payload');
      }
      const payload = parsedBody.data;

      if (payload.user_id === actorUserId) {
        return errorResponse('Staff cannot delete their own account.', 403, 'self_delete_forbidden');
      }

      const { data: targetProfile, error: profileError } = await serviceClient
        .from('users_profile')
        .select('id,role,name,email,mobile,onboarding_complete,created_at,updated_at')
        .eq('id', payload.user_id)
        .maybeSingle();

      if (profileError) {
        return errorResponse(profileError.message, 400, 'user_lookup_failed');
      }

      if (!targetProfile) {
        return errorResponse('User not found.', 404, 'user_not_found');
      }

      if (targetProfile.role !== 'candidate') {
        return errorResponse(
          'Only candidate accounts can be deleted from this admin workflow.',
          403,
          'delete_role_forbidden',
        );
      }

      await clearNonCascadingUserReferences(serviceClient, payload.user_id);

      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(payload.user_id);
      if (deleteError) {
        return errorResponse(deleteError.message, 500, 'user_delete_failed');
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'staff_delete_candidate_user',
        entityType: 'users_profile',
        entityId: payload.user_id,
        beforeJson: targetProfile as unknown as Record<string, unknown>,
        afterJson: null,
      });

      return jsonResponse({
        success: true,
        deleted_user_id: payload.user_id,
        deleted_role: 'candidate',
      });
    },
    { auth: 'staff' },
  ),
);
