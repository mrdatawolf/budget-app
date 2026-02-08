/**
 * Hono environment type for the Budget API server.
 * Defines variables available in the request context after middleware runs.
 */
export type AppEnv = {
  Variables: {
    userId: string;
  };
};
