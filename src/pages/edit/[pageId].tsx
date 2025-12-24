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
  const draftToken = getDraftOwnerTokenFromCookies(cookieHeader);
  
  console.log('[/edit/[pageId]] Loading page:', {
    pageId,
    hasUserId: !!userId,
    hasDraftToken: !!draftToken,
    draftTokenPrefix: draftToken?.slice(0, 20),
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
  // Handle notFound with CLIENT-SIDE redirect to avoid redirect loops
  useEffect(() => {
    if (notFound) {
      // Use window.location for hard redirect - ensures fresh state
      window.location.href = '/new?fresh=1';
    }
  }, [notFound]);
  
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

