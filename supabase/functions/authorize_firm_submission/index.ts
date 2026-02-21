import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAuthedClient, createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const schema = z.object({
  assignment_id: z.string().uuid(),
  decision: z.enum(['authorized', 'declined']),
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
    const payload = schema.parse(await request.json());

    const { data: assignment, error: assignmentError } = await client
      .from('candidate_firm_assignments')
      .select('id,candidate_user_id')
      .eq('id', payload.assignment_id)
      .single();

    if (assignmentError || !assignment || assignment.candidate_user_id !== userId) {
      return errorResponse('Assignment not found for user', 404);
    }

    const upsertResult = await client.from('candidate_authorizations').upsert(
      {
        assignment_id: payload.assignment_id,
        decision: payload.decision,
        decided_by_candidate: userId,
        decided_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id' },
    );

    if (upsertResult.error) {
      return errorResponse(upsertResult.error.message, 400);
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId: userId,
      action: 'candidate_authorization_decision',
      entityType: 'candidate_authorizations',
      entityId: payload.assignment_id,
      afterJson: {
        decision: payload.decision,
      },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }
});
