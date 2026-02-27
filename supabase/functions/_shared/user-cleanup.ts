import { createServiceClient } from './supabase.ts';

export async function clearNonCascadingUserReferences(
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
