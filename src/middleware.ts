/**
 * Next.js Middleware
 * 
 * Handles:
 * 1. Legacy cache-buster query param redirects (?_cb, ?_t) → 301 to clean URL
 *    This ensures SEO stays clean and old links redirect properly.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  
  // Check for legacy cache-buster params and redirect to clean URL
  if (url.searchParams.has('_cb') || url.searchParams.has('_t')) {
    // Remove cache-buster params
    url.searchParams.delete('_cb');
    url.searchParams.delete('_t');
    
    // Build clean URL
    const cleanUrl = url.pathname + (url.search || '');
    
    // 301 permanent redirect to canonical URL
    return NextResponse.redirect(new URL(cleanUrl, request.url), 301);
  }
  
  return NextResponse.next();
}

// Only run middleware on public page routes (not API, static files, etc.)
export const config = {
  matcher: [
    // Match all paths except:
    // - API routes (/api/*)
    // - Static files (/_next/*, /favicon.ico, etc.)
    // - Public assets (/uploads/*, etc.)
    '/((?!api|_next/static|_next/image|favicon.ico|uploads|logo.png|hero-flowers.png).*)',
  ],
};

