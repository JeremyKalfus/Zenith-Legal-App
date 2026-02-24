import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

async function clearNonCascadingUserReferences(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const operations = await Promise.all([
    serviceClient.from('notification_deliveries').update({ user_id: null }).eq('user_id', userId),
    serviceClient.from('audit_events').update({ actor_user_id: null }).eq('actor_user_id', userId),
    serviceClient
      .from('support_data_requests')
      .update({ requester_user_id: null })
      .eq('requester_user_id', userId),
    serviceClient
      .from('support_data_requests')
      .update({ handled_by_staff: null })
      .eq('handled_by_staff', userId),
    serviceClient.from('recruiter_contact_config').update({ updated_by: null }).eq('updated_by', userId),
    serviceClient.from('candidate_firm_assignments').update({ assigned_by: null }).eq('assigned_by', userId),
  ]);

  for (const result of operations) {
    if (result.error) {
      throw new Error(`Failed to clean up user references: ${result.error.message}`);
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const userId = await getCurrentUserId(authHeader);
    const serviceClient = createServiceClient();

    const { data: targetProfile, error: profileError } = await serviceClient
      .from('users_profile')
      .select('id,role,name,email,mobile,onboarding_complete,created_at,updated_at')
      .eq('id', userId)
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

    await clearNonCascadingUserReferences(serviceClient, userId);

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return errorResponse(deleteError.message, 500, 'user_delete_failed');
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: null,
      action: 'candidate_delete_own_account',
      entityType: 'users_profile',
      entityId: userId,
      beforeJson: targetProfile as unknown as Record<string, unknown>,
      afterJson: {
        deleted_by: 'self',
      },
    });

    return jsonResponse({
      success: true,
      deleted_user_id: userId,
      deleted_role: 'candidate',
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('Unauthorized')) {
      return errorResponse(message, 401);
    }
    return errorResponse(message, 500);
  }
});
