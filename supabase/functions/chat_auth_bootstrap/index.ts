import { StreamChat } from 'npm:stream-chat@9.35.1';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { createEdgeHandler } from '../_shared/edge-handler.ts';

const MASON_EMAIL = 'mason@zenithlegal.com';
const STAFF_STREAM_IMAGE_URL = Deno.env.get('STREAM_STAFF_IMAGE_URL') ?? undefined;

function getStaffStreamImage(email?: string | null): string | undefined {
  return email?.trim().toLowerCase() === MASON_EMAIL ? STAFF_STREAM_IMAGE_URL : undefined;
}


Deno.serve(
  createEdgeHandler(
    async ({ request, userId }) => {
      const resolvedUserId = userId as string;
      const payload = await request.json().catch(() => ({}));

      const streamApiKey = Deno.env.get('STREAM_API_KEY');
      const streamApiSecret = Deno.env.get('STREAM_API_SECRET');
      if (!streamApiKey || !streamApiSecret) {
        return errorResponse('Missing Stream credentials', 500);
      }

      const streamServerClient = StreamChat.getInstance(streamApiKey, streamApiSecret);
      const serviceClient = createServiceClient();

      const { data: currentProfile } = await serviceClient
        .from('users_profile')
        .select('id,name,role,email')
        .eq('id', resolvedUserId)
        .single();

      if (!currentProfile) {
        return errorResponse('User profile not found', 404);
      }

      await streamServerClient.upsertUser({
        id: resolvedUserId,
        name: currentProfile.name,
        image: currentProfile.role === 'staff' ? getStaffStreamImage(currentProfile.email) : undefined,
      });

      const token = streamServerClient.createToken(resolvedUserId);
      const requestedCandidateUserId =
        typeof payload.user_id === 'string' && payload.user_id.trim()
          ? payload.user_id.trim()
          : undefined;
      const candidateUserId = currentProfile.role === 'staff' ? requestedCandidateUserId : resolvedUserId;

      if (currentProfile.role === 'staff' && !candidateUserId) {
        return jsonResponse({
          token,
          user_name: currentProfile.name,
          user_image: currentProfile.role === 'staff' ? getStaffStreamImage(currentProfile.email) : undefined,
        });
      }

      if (!candidateUserId) {
        return errorResponse('Candidate user ID required for staff bootstrap', 422);
      }

      const { data: candidateProfile } = await serviceClient
        .from('users_profile')
        .select('id,name')
        .eq('id', candidateUserId)
        .single();
      if (!candidateProfile) {
        return errorResponse('Candidate profile not found', 404);
      }

      const { data: staffProfiles } = await serviceClient
        .from('users_profile')
        .select('id,name,email')
        .eq('role', 'staff');

      const memberProfiles = new Map<string, { id: string; name?: string | null; image?: string }>();
      memberProfiles.set(candidateProfile.id, {
        id: candidateProfile.id,
        name: candidateProfile.name,
      });

      for (const profile of staffProfiles ?? []) {
        memberProfiles.set(profile.id, {
          id: profile.id,
          name: profile.name,
          image: getStaffStreamImage(profile.email),
        });
      }

      const members = Array.from(memberProfiles.keys());
      await Promise.all(
        Array.from(memberProfiles.values()).map((profile) =>
          streamServerClient.upsertUser({
            id: profile.id,
            name: profile.name ?? undefined,
            image: profile.image,
          })
        ),
      );

      const channelId = `candidate-${candidateUserId}`;
      await streamServerClient.channel('messaging', channelId, {
        created_by_id: resolvedUserId,
        members,
        name: `${candidateProfile.name} · Zenith Legal`,
      }).create();

      return jsonResponse({
        token,
        channel_id: channelId,
        user_name: currentProfile.name,
        user_image: currentProfile.role === 'staff' ? getStaffStreamImage(currentProfile.email) : undefined,
      });
    },
    { auth: 'user' },
  ),
);
