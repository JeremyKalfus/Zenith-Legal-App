import { z } from 'npm:zod@4.3.6';
import { writeAuditEvent } from '../_shared/audit.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const schema = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1).max(500),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(400),
  filter_snapshot: z.record(z.unknown()).default({}),
});

type CandidateRow = {
  id: string;
  role: string;
};

type CandidateConsentRow = {
  user_id: string;
  job_opportunity_push_accepted: boolean;
};

type NotificationPreferenceRow = {
  user_id: string;
  push_enabled: boolean;
};

type PushTokenRow = {
  user_id: string;
};

type SkippedCandidate = {
  candidate_id: string;
  reason: 'not_candidate' | 'missing_push_consent' | 'push_disabled' | 'missing_push_token';
};

Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const actorUserId = userId as string;
      const serviceClient = createServiceClient();
      const parsed = schema.safeParse(await request.json());

      if (!parsed.success) {
        return errorResponse('Invalid notification payload', 422, 'invalid_payload');
      }

      const payload = parsed.data;
      const dedupedCandidateIds = Array.from(new Set(payload.candidate_ids));

      const [candidateResult, consentResult, preferenceResult, pushTokenResult] = await Promise.all([
        serviceClient
          .from('users_profile')
          .select('id,role')
          .in('id', dedupedCandidateIds),
        serviceClient
          .from('candidate_consents')
          .select('user_id,job_opportunity_push_accepted')
          .in('user_id', dedupedCandidateIds),
        serviceClient
          .from('notification_preferences')
          .select('user_id,push_enabled')
          .in('user_id', dedupedCandidateIds),
        serviceClient
          .from('push_tokens')
          .select('user_id')
          .in('user_id', dedupedCandidateIds)
          .is('revoked_at', null),
      ]);

      if (candidateResult.error) {
        return errorResponse(candidateResult.error.message, 400, 'candidate_lookup_failed');
      }
      if (consentResult.error) {
        return errorResponse(consentResult.error.message, 400, 'consent_lookup_failed');
      }
      if (preferenceResult.error) {
        return errorResponse(preferenceResult.error.message, 400, 'notification_preference_lookup_failed');
      }
      if (pushTokenResult.error) {
        return errorResponse(pushTokenResult.error.message, 400, 'push_token_lookup_failed');
      }

      const candidateById = new Map(
        ((candidateResult.data ?? []) as CandidateRow[]).map((row) => [row.id, row]),
      );
      const consentByUserId = new Map(
        ((consentResult.data ?? []) as CandidateConsentRow[]).map((row) => [row.user_id, row]),
      );
      const preferenceByUserId = new Map(
        ((preferenceResult.data ?? []) as NotificationPreferenceRow[]).map((row) => [row.user_id, row]),
      );
      const pushReadyUserIds = new Set(
        ((pushTokenResult.data ?? []) as PushTokenRow[]).map((row) => row.user_id),
      );

      const queuedCandidateIds: string[] = [];
      const skippedCandidates: SkippedCandidate[] = [];

      for (const candidateId of dedupedCandidateIds) {
        const candidate = candidateById.get(candidateId);
        if (!candidate || candidate.role !== 'candidate') {
          skippedCandidates.push({ candidate_id: candidateId, reason: 'not_candidate' });
          continue;
        }

        if (consentByUserId.get(candidateId)?.job_opportunity_push_accepted !== true) {
          skippedCandidates.push({ candidate_id: candidateId, reason: 'missing_push_consent' });
          continue;
        }

        if (preferenceByUserId.get(candidateId)?.push_enabled === false) {
          skippedCandidates.push({ candidate_id: candidateId, reason: 'push_disabled' });
          continue;
        }

        if (!pushReadyUserIds.has(candidateId)) {
          skippedCandidates.push({ candidate_id: candidateId, reason: 'missing_push_token' });
          continue;
        }

        queuedCandidateIds.push(candidateId);
      }

      if (queuedCandidateIds.length > 0) {
        const notificationRows = queuedCandidateIds.map((candidateId) => ({
          user_id: candidateId,
          channel: 'push',
          event_type: 'job_opportunity.match',
          payload: {
            title: payload.title,
            body: payload.body,
            filter_snapshot: payload.filter_snapshot,
          },
          status: 'queued',
        }));

        const { error: queueError } = await serviceClient
          .from('notification_deliveries')
          .insert(notificationRows);

        if (queueError) {
          return errorResponse(queueError.message, 400, 'notification_queue_failed');
        }
      }

      const campaignId = crypto.randomUUID();
      await writeAuditEvent({
        client: serviceClient,
        actorUserId,
        action: 'staff_send_job_opportunity_notification',
        entityType: 'notification_campaign',
        entityId: campaignId,
        afterJson: {
          requested_candidate_ids: dedupedCandidateIds,
          queued_candidate_ids: queuedCandidateIds,
          skipped_candidates: skippedCandidates,
          title: payload.title,
          body: payload.body,
          filter_snapshot: payload.filter_snapshot,
        },
      });

      return jsonResponse({
        success: true,
        campaign_id: campaignId,
        queued_count: queuedCandidateIds.length,
        skipped_count: skippedCandidates.length,
        queued_candidate_ids: queuedCandidateIds,
        skipped_candidates: skippedCandidates,
      });
    },
    { auth: 'staff', method: 'POST' },
  ),
);
