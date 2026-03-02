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

type StreamErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function getStaffStreamImage(email?: string | null): string {
  return email?.trim().toLowerCase() === MASON_EMAIL ? (STAFF_STREAM_IMAGE_URL ?? '') : '';
}

function getStreamServerClient() {
  const streamApiKey = Deno.env.get('STREAM_API_KEY');
  const streamApiSecret = Deno.env.get('STREAM_API_SECRET');
  if (!streamApiKey || !streamApiSecret) {
    throw new Error('Missing Stream credentials');
  }

  return StreamChat.getInstance(streamApiKey, streamApiSecret);
}

function asStreamError(error: unknown): StreamErrorLike {
  if (typeof error === 'object' && error !== null) {
    return error as StreamErrorLike;
  }
  return {};
}

function getStreamErrorMessage(error: unknown): string {
  const parsed = asStreamError(error);
  if (typeof parsed.message === 'string' && parsed.message.trim()) {
    return parsed.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function isStatus(error: unknown, status: number): boolean {
  const parsed = asStreamError(error);
  return parsed.status === status || parsed.statusCode === status;
}

function isNotFoundError(error: unknown): boolean {
  if (isStatus(error, 404)) {
    return true;
  }
  const message = getStreamErrorMessage(error).toLowerCase();
  return message.includes('not found') || message.includes('does not exist');
}

function isAlreadyExistsError(error: unknown): boolean {
  if (isStatus(error, 409)) {
    return true;
  }
  const message = getStreamErrorMessage(error).toLowerCase();
  return message.includes('already exists');
}

function isAlreadyMemberError(error: unknown): boolean {
  const message = getStreamErrorMessage(error).toLowerCase();
  return message.includes('already member') || message.includes('already members');
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
    image: '',
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

  try {
    await channel.query();
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    try {
      await channel.create();
    } catch (createError) {
      if (!isAlreadyExistsError(createError)) {
        throw createError;
      }
    }
  }

  try {
    await channel.addMembers(Array.from(memberProfiles.keys()));
  } catch (error) {
    if (!isAlreadyMemberError(error)) {
      throw error;
    }
  }

  await channel.sendMessage({
    text,
    user_id: actorUserId,
  });
}
