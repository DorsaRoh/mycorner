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

import { useEffect } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Editor } from '@/components/editor/Editor';
import { 
  getUserIdFromCookies, 
  getDraftOwnerTokenFromCookies 
} from '@/server/auth/session';
import { getPageForEdit } from '@/server/pages';

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
  
  // PRIORITY: If dt query param exists, ALWAYS use it (not as fallback)
  // This ensures we use the exact token that was set during page creation in /new
  // This is critical because the cookie from /new's redirect may not be processed yet
  const queryDraftToken = context.query.dt as string | undefined;
  if (queryDraftToken) {
    draftToken = queryDraftToken;
    console.log('[/edit/[pageId]] Using draft token from URL query (priority)');
    
    // Also set/refresh the cookie for subsequent requests
    const { buildDraftOwnerTokenCookie } = await import('@/server/auth/session');
    context.res.setHeader('Set-Cookie', buildDraftOwnerTokenCookie(draftToken));
  }
  
  console.log('[/edit/[pageId]] Loading page:', {
    pageId,
    hasUserId: !!userId,
    hasDraftToken: !!draftToken,
    draftTokenPrefix: draftToken?.slice(0, 20),
    usedQueryToken: !!queryDraftToken,
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
  // Handle notFound - show error instead of redirecting to prevent infinite loops
  // The redirect loop was: /new -> /edit/xxx (fails) -> /new -> /edit/yyy (fails) -> ...
  
  // Clean up URL if we used the dt query param (do this first, before any redirects)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('dt=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('dt');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);
  
  // Show error state with manual retry option instead of auto-redirect
  if (notFound) {
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
      }}>
        <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Page not found</h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>
          This page doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <button 
          onClick={() => window.location.href = '/new'}
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
          Create a new page
        </button>
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

