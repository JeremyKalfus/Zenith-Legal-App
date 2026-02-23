import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { assertStaff, createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';

const schema = z.object({
  rows: z.array(z.object({ name: z.string().trim().min(1).max(200) })).min(1),
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

    const accepted: string[] = [];
    const rejected: Array<{ name: string; reason: string }> = [];

    for (const row of payload.rows) {
      const name = row.name.trim();
      const normalized = name.toLowerCase();

      const { error } = await serviceClient.from('firms').upsert(
        {
          name,
          normalized_name: normalized,
          active: true,
        },
        { onConflict: 'normalized_name', ignoreDuplicates: true },
      );

      if (error) {
        rejected.push({ name, reason: error.message });
      } else {
        accepted.push(name);
      }
    }

    await writeAuditEvent({
      client: serviceClient,
      actorUserId,
      action: 'bulk_paste_ingest_firms',
      entityType: 'firms',
      entityId: 'bulk',
      afterJson: {
        accepted_count: accepted.length,
        rejected_count: rejected.length,
      },
    });

    return jsonResponse({
      accepted,
      rejected,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('Unauthorized')) {
      return errorResponse(message, 401);
    }
    if (message === 'Forbidden: staff access required') {
      return errorResponse(message, 403);
    }
    return errorResponse(message, 500);
  }
});
