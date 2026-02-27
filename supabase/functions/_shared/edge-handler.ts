import { errorResponse, jsonResponse } from './http.ts';
import { assertStaff, getCurrentUserId } from './supabase.ts';

export type EdgeAuthMode = 'none' | 'user' | 'staff';

export type EdgeHandlerContext = {
  request: Request;
  authHeader: string | null;
  userId: string | null;
};

type EdgeHandlerOptions = {
  auth?: EdgeAuthMode;
  method?: string;
  onError?: (message: string) => Response | null;
};

function mapDefaultEdgeError(message: string): Response {
  if (message.startsWith('Unauthorized')) {
    return errorResponse(message, 401);
  }
  if (message === 'Forbidden: staff access required') {
    return errorResponse(message, 403);
  }
  if (message.startsWith('Invalid payload:')) {
    return errorResponse(message, 400);
  }
  return errorResponse(message, 500);
}

export function createEdgeHandler(
  handler: (context: EdgeHandlerContext) => Promise<Response>,
  options?: EdgeHandlerOptions,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return jsonResponse({ ok: true });
    }

    if (options?.method && request.method !== options.method) {
      return errorResponse('Method not allowed', 405);
    }

    try {
      const authHeader = request.headers.get('Authorization');
      const authMode = options?.auth ?? 'none';

      let userId: string | null = null;
      if (authMode === 'user') {
        userId = await getCurrentUserId(authHeader);
      } else if (authMode === 'staff') {
        userId = await assertStaff(authHeader);
      }

      return await handler({ request, authHeader, userId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      const mapped = options?.onError?.(message);
      return mapped ?? mapDefaultEdgeError(message);
    }
  };
}
