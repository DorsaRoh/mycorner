/**
 * /edit/[pageId] - The canonical editor surface
 * 
 * ROUTING MODEL:
 * - Loads a specific page by ID for editing
 * - Validates ownership (user_id or anon token)
 * - Renders the Editor component with page data
 * - If page not found or not authorized → CLIENT-SIDE redirect to /new?fresh=1
 *   (NOT server-side to avoid redirect loops with cookie issues)
 * 
 * Access control:
 * - Authenticated user: must own the page (user_id matches)
 * - Anonymous user: must have valid draft_owner_token matching owner_id
 * 
 * Never shows a blank page - always redirects or renders content.
 */

import { useEffect, useRef } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Editor } from '@/components/editor/Editor';
import { 
  getUserIdFromCookies, 
  getDraftOwnerTokenFromCookies 
} from '@/server/auth/session';
import { getPageForEdit } from '@/server/pages';

// =============================================================================
// Redirect Loop Guard
// =============================================================================

const REDIRECT_GUARD_KEY = 'yourcorner:edit_redirect_guard';
const REDIRECT_COOLDOWN_MS = 30_000; // 30 seconds

/**
 * Check if we're in a redirect loop and should stop.
 * Uses sessionStorage to track recent redirects from /edit to /new.
 * 
 * Returns:
 * - { shouldRedirect: true } - Safe to redirect
 * - { shouldRedirect: false, reason: string } - Loop detected, show error
 */
function checkRedirectGuard(): { shouldRedirect: boolean; reason?: string } {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return { shouldRedirect: true };
  }
  
  try {
    const stored = sessionStorage.getItem(REDIRECT_GUARD_KEY);
    const now = Date.now();
    
    if (stored) {
      const data = JSON.parse(stored) as { count: number; firstAt: number; lastAt: number };
      const timeSinceFirst = now - data.firstAt;
      
      // If we've redirected more than 2 times in the cooldown period, it's a loop
      if (data.count >= 2 && timeSinceFirst < REDIRECT_COOLDOWN_MS) {
        return {
          shouldRedirect: false,
          reason: `Redirect loop detected (${data.count} redirects in ${Math.round(timeSinceFirst / 1000)}s). This usually means there's an issue with your browser session. Try clearing cookies or using an incognito window.`,
        };
      }
      
      // If enough time has passed, reset the counter
      if (timeSinceFirst >= REDIRECT_COOLDOWN_MS) {
        sessionStorage.removeItem(REDIRECT_GUARD_KEY);
      } else {
        // Update counter
        sessionStorage.setItem(REDIRECT_GUARD_KEY, JSON.stringify({
          count: data.count + 1,
          firstAt: data.firstAt,
          lastAt: now,
        }));
      }
    } else {
      // First redirect - start tracking
      sessionStorage.setItem(REDIRECT_GUARD_KEY, JSON.stringify({
        count: 1,
        firstAt: now,
        lastAt: now,
      }));
    }
    
    return { shouldRedirect: true };
  } catch {
    // On any error, allow redirect (fail open)
    return { shouldRedirect: true };
  }
}

/**
 * Clear the redirect guard (call when successfully loading a page).
 */
function clearRedirectGuard(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return;
  }
  
  try {
    sessionStorage.removeItem(REDIRECT_GUARD_KEY);
  } catch {
    // Ignore
  }
}

interface EditorPageProps {
  pageId: string;
  title: string | null;
  blocks: unknown[];
  background: unknown;
  isPublished: boolean;
  serverRevision: number;
  publishedRevision: number | null;
  slug: string | null;
  isAuthenticated: boolean;
  notFound?: boolean;
}

export const getServerSideProps: GetServerSideProps<EditorPageProps> = async (context) => {
  const { pageId } = context.params as { pageId: string };
  const cookieHeader = context.req.headers.cookie;
  
  // Prevent caching
  context.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  // Get auth info
  const userId = await getUserIdFromCookies(cookieHeader);
  let draftToken = getDraftOwnerTokenFromCookies(cookieHeader);
  
  // CRITICAL FIX: Always prefer query param dt over stale cookie
  // 
  // BUG CONTEXT (infinite redirect loop):
  // When /new creates a page, it generates a NEW draft token and redirects to
  // /edit/page_xxx?dt=NEW_TOKEN with Set-Cookie for the new token.
  // But when the browser follows the redirect, it may still send the OLD cookie
  // (redirect happens before the new cookie is fully processed).
  // 
  // OLD CODE: if (!draftToken && queryDraftToken) { draftToken = queryDraftToken }
  // This IGNORES the query param if ANY cookie exists, causing ownership mismatch.
  // 
  // FIX: Always prefer the query param when present - it's the authoritative token
  // from the most recent /new operation. The cookie is just for persistence.
  const queryDraftToken = context.query.dt as string | undefined;
  if (queryDraftToken) {
    // Query param is authoritative - it comes from the most recent /new redirect
    if (draftToken && draftToken !== queryDraftToken) {
      console.log('[/edit/[pageId]] Query dt differs from cookie - using query (cookie may be stale)');
    }
    draftToken = queryDraftToken;
    
    // Set the cookie to match the query param for future requests
    const { buildDraftOwnerTokenCookie } = await import('@/server/auth/session');
    context.res.setHeader('Set-Cookie', buildDraftOwnerTokenCookie(draftToken));
  }
  
  console.log('[/edit/[pageId]] Loading page:', {
    pageId,
    hasUserId: !!userId,
    hasDraftToken: !!draftToken,
    draftTokenPrefix: draftToken?.slice(0, 20),
    usedQueryToken: !!queryDraftToken && !getDraftOwnerTokenFromCookies(cookieHeader),
  });
  
  try {
    // Fetch the page with ownership check
    const result = await getPageForEdit({
      pageId,
      userId: userId || null,
      anonToken: draftToken || null,
    });
    
    if (!result) {
      // Page not found or not authorized - return props with notFound flag
      // We do CLIENT-SIDE redirect to avoid redirect loops with cookie issues
      console.log('[/edit/[pageId]] Page not found or not authorized:', pageId);
      return {
        props: {
          pageId,
          title: null,
          blocks: [],
          background: null,
          isPublished: false,
          serverRevision: 1,
          publishedRevision: null,
          slug: null,
          isAuthenticated: !!userId,
          notFound: true,
        },
      };
    }
    
    return {
      props: {
        pageId: result.page.id,
        title: result.title,
        blocks: result.blocks as unknown[],
        background: result.background as unknown,
        isPublished: !!result.page.is_published,
        serverRevision: result.page.server_revision,
        publishedRevision: result.page.published_revision ?? null,
        slug: result.page.slug ?? null,
        isAuthenticated: !!userId,
      },
    };
  } catch (error) {
    console.error('[/edit/[pageId]] Error fetching page:', error);
    
    // On error, return props with notFound flag for client-side redirect
    return {
      props: {
        pageId,
        title: null,
        blocks: [],
        background: null,
        isPublished: false,
        serverRevision: 1,
        publishedRevision: null,
        slug: null,
        isAuthenticated: !!userId,
        notFound: true,
      },
    };
  }
};

export default function EditPageById({
  pageId,
  title,
  blocks,
  background,
  isPublished,
  serverRevision,
  publishedRevision,
  slug,
  notFound,
}: EditorPageProps) {
  const redirectBlockedRef = useRef<{ blocked: boolean; reason?: string }>({ blocked: false });
  
  // Handle notFound with CLIENT-SIDE redirect to avoid redirect loops
  useEffect(() => {
    if (notFound) {
      // Check redirect guard BEFORE redirecting
      const guard = checkRedirectGuard();
      
      if (!guard.shouldRedirect) {
        console.error('[/edit/[pageId]] Redirect loop detected, blocking redirect:', guard.reason);
        redirectBlockedRef.current = { blocked: true, reason: guard.reason };
        // Force re-render to show error UI
        window.dispatchEvent(new Event('redirect-blocked'));
        return;
      }
      
      // Safe to redirect
      console.log('[/edit/[pageId]] Page not found, redirecting to /new');
      window.location.href = '/new?fresh=1';
    } else {
      // Page loaded successfully - clear the redirect guard
      clearRedirectGuard();
    }
  }, [notFound]);
  
  // Clean up URL if we used the dt query param
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('dt=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('dt');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);
  
  // Show error if redirect was blocked (loop detected)
  if (redirectBlockedRef.current.blocked) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
        padding: '20px',
        maxWidth: '500px',
        margin: '0 auto',
      }}>
        <h1 style={{ fontSize: '24px', marginBottom: '16px', color: '#c00' }}>
          Something went wrong
        </h1>
        <p style={{ color: '#666', marginBottom: '24px', lineHeight: 1.5 }}>
          {redirectBlockedRef.current.reason || 'Unable to load this page.'}
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => {
              // Clear all session storage and cookies, then try again
              try {
                sessionStorage.clear();
                document.cookie.split(';').forEach(c => {
                  const name = c.split('=')[0].trim();
                  if (name.startsWith('yourcorner')) {
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
                  }
                });
              } catch {
                // Ignore storage/cookie errors - best effort cleanup
              }
              window.location.href = '/new?fresh=1';
            }}
            style={{
              padding: '12px 24px',
              backgroundColor: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Start Fresh
          </button>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              backgroundColor: '#fff',
              color: '#000',
              border: '1px solid #ccc',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  
  // Show loading while redirecting
  if (notFound) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p>Loading...</p>
      </div>
    );
  }
  
  // Render the editor
  return (
    <>
      <Head>
        <title>My Corner</title>
      </Head>
      <Editor
        pageId={pageId}
        mode="server"
        initialBlocks={blocks as any[]}
        initialTitle={title || ''}
        initialBackground={background as any}
        initialPublished={isPublished}
        initialServerRevision={serverRevision}
        initialPublishedRevision={publishedRevision}
        initialSlug={slug}
      />
    </>
  );
}

