import { StreamChat } from 'npm:stream-chat@9.35.1';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, getCurrentUserId } from '../_shared/supabase.ts';

const MASON_EMAIL = 'mason@zenithlegal.com';
const ZENITH_LOGO_IMAGE_URL =
  'https://njxgoypivrxyrukpouxb.supabase.co/storage/v1/object/public/stream-avatars/stream-users/7b24ba95-b1e0-4256-bc7f-226fac2d65f3/zenith-legal-logo.webp';

function getStaffStreamImage(email?: string | null): string | undefined {
  return email?.trim().toLowerCase() === MASON_EMAIL ? ZENITH_LOGO_IMAGE_URL : undefined;
}

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
      .select('id,name,role,email')
      .eq('id', userId)
      .single();

    if (!currentProfile) {
      return errorResponse('User profile not found', 404);
    }

    await streamServerClient.upsertUser({
      id: userId,
      name: currentProfile.name,
      image: currentProfile.role === 'staff' ? getStaffStreamImage(currentProfile.email) : undefined,
    });

    const token = streamServerClient.createToken(userId);

    const requestedCandidateUserId =
      typeof payload.user_id === 'string' && payload.user_id.trim()
        ? payload.user_id.trim()
        : undefined;

    const candidateUserId =
      currentProfile.role === 'staff' ? requestedCandidateUserId : userId;

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
      created_by_id: userId,
      members,
      name: `${candidateProfile.name} · Zenith Legal`,
    }).create();

    return jsonResponse({
      token,
      channel_id: channelId,
      user_name: currentProfile.name,
      user_image: currentProfile.role === 'staff' ? getStaffStreamImage(currentProfile.email) : undefined,
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('Unauthorized')) {
      return errorResponse(message, 401);
    }
    return errorResponse(message, 500);
  }
});
