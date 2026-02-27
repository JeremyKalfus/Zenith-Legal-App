import { z } from 'npm:zod@4.3.6';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const ingestRowsSchema = z.object({
  rows: z.array(z.object({ name: z.string().trim().min(1).max(200) })).min(1),
});


Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const actorUserId = userId as string;
      const serviceClient = createServiceClient();
      const parsedBody = ingestRowsSchema.safeParse(await request.json());
      if (!parsedBody.success) {
        return errorResponse('Invalid rows payload', 422, 'invalid_payload');
      }
      const payload = parsedBody.data;

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
    },
    { auth: 'staff' },
  ),
);
