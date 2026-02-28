import { env } from '../config/env';
import { supabase } from './supabase';

export const PROFILE_PICTURE_BUCKET = 'profile-pictures';

function toFileExtension(mimeType: string | null | undefined): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/jpeg':
    default:
      return 'jpg';
  }
}

function getPathFromProfilePictureUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const prefixes = [
    `${env.supabaseUrl}/storage/v1/object/public/${PROFILE_PICTURE_BUCKET}/`,
    `${env.supabaseUrl}/storage/v1/object/sign/${PROFILE_PICTURE_BUCKET}/`,
  ];

  for (const prefix of prefixes) {
    if (url.startsWith(prefix)) {
      const withoutPrefix = url.slice(prefix.length).split('?')[0] ?? '';
      const decoded = decodeURIComponent(withoutPrefix);
      return decoded.length > 0 ? decoded : null;
    }
  }

  return null;
}

export async function uploadProfilePictureForUser(params: {
  userId: string;
  sourceUri: string;
  mimeTypeHint?: string | null;
}): Promise<string> {
  const response = await fetch(params.sourceUri);
  if (!response.ok) {
    throw new Error('Unable to read selected image. Please choose another image.');
  }

  const blob = await response.blob();
  const mimeType = blob.type || params.mimeTypeHint || 'image/jpeg';
  const extension = toFileExtension(mimeType);
  const filePath = `${params.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(PROFILE_PICTURE_BUCKET).upload(filePath, blob, {
    cacheControl: '3600',
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PROFILE_PICTURE_BUCKET).getPublicUrl(filePath);
  if (!publicUrl) {
    throw new Error('Unable to generate profile picture URL.');
  }

  return publicUrl;
}

export async function removeProfilePictureByUrl(url: string | null | undefined): Promise<void> {
  const path = getPathFromProfilePictureUrl(url);
  if (!path) {
    return;
  }

  await supabase.storage.from(PROFILE_PICTURE_BUCKET).remove([path]);
}
