import { StreamChat } from 'npm:stream-chat@9.35.1';
import type { createServiceClient } from './supabase.ts';

type ServiceClient = ReturnType<typeof createServiceClient>;

type StaffProfile = {
  id: string;
  name: string | null;
  email: string | null;
};

const MASON_EMAIL = 'mason@zenithlegal.com';
const STAFF_STREAM_IMAGE_URL = Deno.env.get('STREAM_STAFF_IMAGE_URL') ?? undefined;

function getStaffStreamImage(email?: string | null): string | undefined {
  return email?.trim().toLowerCase() === MASON_EMAIL ? STAFF_STREAM_IMAGE_URL : undefined;
}

function getStreamServerClient() {
  const streamApiKey = Deno.env.get('STREAM_API_KEY');
  const streamApiSecret = Deno.env.get('STREAM_API_SECRET');
  if (!streamApiKey || !streamApiSecret) {
    throw new Error('Missing Stream credentials');
  }

  return StreamChat.getInstance(streamApiKey, streamApiSecret);
}

export async function sendCandidateRecruiterChannelMessage(params: {
  serviceClient: ServiceClient;
  candidateUserId: string;
  actorUserId: string;
  text: string;
}) {
  const { actorUserId, candidateUserId, serviceClient, text } = params;
  const streamServerClient = getStreamServerClient();

  const [{ data: candidateProfile, error: candidateError }, { data: staffProfiles, error: staffError }] =
    await Promise.all([
      serviceClient
        .from('users_profile')
        .select('id,name')
        .eq('id', candidateUserId)
        .maybeSingle(),
      serviceClient
        .from('users_profile')
        .select('id,name,email')
        .eq('role', 'staff'),
    ]);

  if (candidateError) {
    throw new Error(`Candidate profile lookup failed: ${candidateError.message}`);
  }
  if (!candidateProfile) {
    throw new Error('Candidate profile not found for chat messaging');
  }
  if (staffError) {
    throw new Error(`Staff profile lookup failed: ${staffError.message}`);
  }

  const memberProfiles = new Map<string, { id: string; name?: string; image?: string }>();
  memberProfiles.set(candidateProfile.id, {
    id: candidateProfile.id,
    name: candidateProfile.name ?? undefined,
  });

  for (const profile of ((staffProfiles ?? []) as StaffProfile[])) {
    memberProfiles.set(profile.id, {
      id: profile.id,
      name: profile.name ?? undefined,
      image: getStaffStreamImage(profile.email),
    });
  }

  await Promise.all(
    Array.from(memberProfiles.values()).map((profile) =>
      streamServerClient.upsertUser({
        id: profile.id,
        name: profile.name,
        image: profile.image,
      })
    ),
  );

  const channelId = `candidate-${candidateUserId}`;
  const channel = streamServerClient.channel('messaging', channelId, {
    created_by_id: actorUserId,
    members: Array.from(memberProfiles.keys()),
    name: `${candidateProfile.name ?? 'Candidate'} · Zenith Legal`,
  });

  await channel.create();
  await channel.sendMessage({
    text,
    user_id: actorUserId,
  });
}
