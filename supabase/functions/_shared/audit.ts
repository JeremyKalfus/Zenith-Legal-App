import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

export async function writeAuditEvent(params: {
  client: SupabaseClient;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
}) {
  await params.client.from('audit_events').insert({
    actor_user_id: params.actorUserId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    before_json: params.beforeJson ?? null,
    after_json: params.afterJson ?? null,
  });
}
