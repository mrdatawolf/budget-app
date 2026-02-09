import { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
/**
 * Authentication middleware for Hono.
 *
 * In local mode (localhost/127.0.0.1): Uses implicit local user — no token required.
 * In remote mode: Verifies JWT signature against Clerk's JWKS with RS256.
 */
export declare const requireAuth: () => MiddlewareHandler<AppEnv>;
/**
 * Get the authenticated user ID from the context.
 * Should only be called after requireAuth middleware has run.
 */
export declare function getUserId(c: {
    get: (key: 'userId') => string;
}): string;
/**
 * Check if running in local mode (no cloud auth required).
 */
export declare function isLocalMode(): boolean;
