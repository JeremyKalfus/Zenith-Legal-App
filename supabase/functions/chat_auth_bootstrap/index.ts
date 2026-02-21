import { StreamChat } from 'npm:stream-chat@9.35.1';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const userId = await getCurrentUserId(authHeader);
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
      .select('id,name,role')
      .eq('id', userId)
      .single();

    if (!currentProfile) {
      return errorResponse('User profile not found', 404);
    }

    const candidateUserId =
      currentProfile.role === 'staff'
        ? (payload.user_id as string | undefined)
        : userId;

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
      .select('id')
      .eq('role', 'staff');

    const members = Array.from(
      new Set([candidateUserId, ...(staffProfiles ?? []).map((profile) => profile.id)]),
    );

    const channelId = `candidate-${candidateUserId}`;

    await streamServerClient.upsertUser({
      id: userId,
      name: currentProfile.name,
    });

    await streamServerClient.channel('messaging', channelId, {
      members,
      name: `${candidateProfile.name} · Zenith Legal`,
    }).create();

    const token = streamServerClient.createToken(userId);

    return jsonResponse({
      token,
      channel_id: channelId,
      user_name: currentProfile.name,
    });
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }
});
