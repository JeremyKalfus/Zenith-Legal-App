import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const updateUserRoleSchema = z.object({
  user_id: z.string().uuid(),
  new_role: z.literal('staff'),
});

Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const actorUserId = userId as string;
      const serviceClient = createServiceClient();
      const parsedBody = updateUserRoleSchema.safeParse(await request.json());

      if (!parsedBody.success) {
        return errorResponse('Invalid payload', 422, 'invalid_payload');
      }

      const payload = parsedBody.data;

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

      if (targetProfile.role === payload.new_role) {
        return errorResponse('User already has this role.', 409, 'role_already_set');
      }

      if (targetProfile.role !== 'candidate') {
        return errorResponse(
          'Only candidate accounts can be promoted to staff from this workflow.',
          403,
          'role_update_forbidden',
        );
      }

      const { data: updatedProfile, error: updateError } = await serviceClient
        .from('users_profile')
        .update({ role: payload.new_role })
        .eq('id', payload.user_id)
        .select('id,role,name,email,mobile,onboarding_complete,created_at,updated_at')
        .single();

      if (updateError || !updatedProfile) {
        return errorResponse(updateError?.message ?? 'Unable to update user role.', 400, 'role_update_failed');
      }

      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'staff_update_user_role',
        entityType: 'users_profile',
        entityId: payload.user_id,
        beforeJson: targetProfile as unknown as Record<string, unknown>,
        afterJson: updatedProfile as unknown as Record<string, unknown>,
      });

      return jsonResponse({
        success: true,
        user_id: payload.user_id,
        previous_role: targetProfile.role,
        new_role: updatedProfile.role,
      });
    },
    { auth: 'staff' },
  ),
);
