import { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import type { AppEnv } from '../types';

// Local user ID used when no cloud auth is present
const LOCAL_USER_ID = 'local';

// Cached JWKS fetcher — created lazily on first remote request
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Derive the Clerk JWKS URL from the publishable key.
 * Clerk publishable keys are formatted as `pk_test_<base64>` or `pk_live_<base64>`.
 * The base64 portion decodes to the Clerk frontend API domain.
 */
function getClerkJwksUrl(): string {
  const key = process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error('CLERK_PUBLISHABLE_KEY or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required for remote mode');
  }

  // Extract base64 portion after the prefix (pk_test_ or pk_live_)
  const parts = key.split('_');
  const encoded = parts[parts.length - 1];
  const domain = Buffer.from(encoded, 'base64').toString('utf-8').replace(/\$/, '');

  return `https://${domain}/.well-known/jwks.json`;
}

/**
 * Get or create the cached JWKS fetcher.
 */
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const url = getClerkJwksUrl();
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

/**
 * Authentication middleware for Hono.
 *
 * In local mode (localhost/127.0.0.1): Uses implicit local user — no token required.
 * In remote mode: Verifies JWT signature against Clerk's JWKS with RS256.
 */
export const requireAuth = (): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const host = c.req.header('host') || '';
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

    if (isLocal) {
      // Local mode: implicit user
      c.set('userId', LOCAL_USER_ID);
    } else {
      // Remote mode: verify JWT
      const authHeader = c.req.header('Authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized', message: 'Missing or invalid authorization header' }, 401);
      }

      const token = authHeader.slice(7);

      try {
        const { payload } = await jwtVerify(token, getJwks(), {
          clockTolerance: 30, // 30 seconds tolerance for clock skew
        });

        const userId = payload.sub;

        if (!userId) {
          return c.json({ error: 'Unauthorized', message: 'Invalid token: missing user ID' }, 401);
        }

        c.set('userId', userId);
      } catch (err) {
        if (err instanceof joseErrors.JWTExpired) {
          return c.json({ error: 'Unauthorized', message: 'Token expired' }, 401);
        }
        if (err instanceof joseErrors.JWTClaimValidationFailed) {
          return c.json({ error: 'Unauthorized', message: 'Token claim validation failed' }, 401);
        }
        if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
          return c.json({ error: 'Unauthorized', message: 'Invalid token signature' }, 401);
        }
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
