import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for local-first mode.
 * All routes are public - no authentication required for local database operations.
 * Cloud sync (Phase 4+) will handle authentication separately when connecting to cloud.
 */
export function middleware(request: NextRequest) {
  // Allow all requests through - no auth protection in local-only mode
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
