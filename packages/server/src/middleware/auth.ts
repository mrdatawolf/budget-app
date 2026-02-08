import { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

// Local user ID used when no cloud auth is present
const LOCAL_USER_ID = 'local';

/**
 * Authentication middleware for Hono.
 *
 * In local mode (localhost/127.0.0.1): Uses implicit local user
 * In remote mode: Verifies JWT token from Authorization header
 */
export const requireAuth = (): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const host = c.req.header('host') || '';
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

    if (isLocal) {
      // Local mode: implicit user
      c.set('userId', LOCAL_USER_ID);
    } else {
      // Remote mode: verify token
      const authHeader = c.req.header('Authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized', message: 'Missing or invalid authorization header' }, 401);
      }

      const token = authHeader.slice(7);

      try {
        // TODO: Implement actual Clerk JWT verification
        // For now, extract userId from token payload (base64 decode the payload section)
        // This is a placeholder - real implementation will use Clerk SDK
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        const userId = payload.sub || payload.userId;

        if (!userId) {
          return c.json({ error: 'Unauthorized', message: 'Invalid token: missing user ID' }, 401);
        }

        c.set('userId', userId);
      } catch {
        return c.json({ error: 'Unauthorized', message: 'Invalid token' }, 401);
      }
    }

    await next();
  };
};

/**
 * Get the authenticated user ID from the context.
 * Should only be called after requireAuth middleware has run.
 */
export function getUserId(c: { get: (key: 'userId') => string }): string {
  return c.get('userId');
}

/**
 * Check if running in local mode (no cloud auth required).
 */
export function isLocalMode(): boolean {
  // TODO: This could be enhanced to check environment variables or config
  return true; // For now, always local mode
}
