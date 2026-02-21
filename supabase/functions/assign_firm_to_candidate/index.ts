import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { assertStaff, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const schema = z.object({
  candidate_id: z.string().uuid(),
  firm_id: z.string().uuid(),
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const actorUserId = await assertStaff(authHeader);
    const serviceClient = createServiceClient();
    const payload = schema.parse(await request.json());

    const { data, error } = await serviceClient
      .from('candidate_firm_assignments')
      .insert({
        candidate_user_id: payload.candidate_id,
        firm_id: payload.firm_id,
        status_enum: 'Waiting on your authorization to contact/submit',
        assigned_by: actorUserId,
      })
      .select('*')
      .single();

    if (error || !data) {
      return errorResponse(error?.message ?? 'Unable to assign firm', 400);
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId,
      action: 'assign_firm_to_candidate',
      entityType: 'candidate_firm_assignments',
      entityId: data.id,
      afterJson: data,
    });

    return jsonResponse({ success: true, assignment: data });
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }
});
