import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createAuthedClient(authHeader: string | null) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader ?? '',
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) {
    throw new Error('Unauthorized: missing Authorization header');
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    throw new Error('Unauthorized: malformed Authorization header');
  }
  return token;
}

export async function getCurrentUserId(authHeader: string | null): Promise<string> {
  const token = extractBearerToken(authHeader);
  const client = createAuthedClient(authHeader);
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    throw new Error(`Unauthorized: ${error?.message ?? 'user not found'}`);
  }

  return user.id;
}

export async function assertStaff(authHeader: string | null): Promise<string> {
  const userId = await getCurrentUserId(authHeader);
  const client = createAuthedClient(authHeader);
  const { data, error } = await client
    .from('users_profile')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data || data.role !== 'staff') {
    throw new Error('Forbidden: staff access required');
  }

  return userId;
}
