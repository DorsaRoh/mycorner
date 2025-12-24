/**
 * /edit/[pageId] - The canonical editor surface
 * 
 * ROUTING MODEL:
 * - Loads a specific page by ID for editing
 * - Validates ownership (user_id or anon token)
 * - Renders the Editor component with page data
 * 
 * Access control:
 * - Authenticated user: must own the page (user_id matches)
 * - Anonymous user: must have valid draft_owner_token matching owner_id
 * 
 * Never shows a blank page - always loading/error/content states.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Editor } from '@/components/editor/Editor';
import { 
  getUserIdFromCookies, 
  getDraftOwnerTokenFromCookies 
} from '@/server/auth/session';
import { getPageForEdit } from '@/server/pages';
import { NotFoundPage } from '@/components/viewer/NotFoundPage';
// Editor renders its own styles

interface EditorPageProps {
  pageId: string;
  title: string | null;
  blocks: unknown[];
  background: unknown;
  isPublished: boolean;
  serverRevision: number;
  publishedRevision: number | null;
  isAuthenticated: boolean;
  error?: 'not_found' | 'not_authorized';
}

export const getServerSideProps: GetServerSideProps<EditorPageProps> = async (context) => {
  const { pageId } = context.params as { pageId: string };
  const cookieHeader = context.req.headers.cookie;
  
  // Get auth info
  const userId = await getUserIdFromCookies(cookieHeader);
  const draftToken = getDraftOwnerTokenFromCookies(cookieHeader);
  
  try {
    // Fetch the page with ownership check
    const result = await getPageForEdit({
      pageId,
      userId: userId || null,
      anonToken: draftToken || null,
    });
    
    if (!result) {
      // Page not found or not authorized
      return {
        props: {
          pageId,
          title: null,
          blocks: [],
          background: null,
          isPublished: false,
          serverRevision: 1,
          publishedRevision: null,
          isAuthenticated: !!userId,
          error: 'not_found',
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
        isAuthenticated: !!userId,
      },
    };
  } catch (error) {
    console.error('[/edit/[pageId]] Error fetching page:', error);
    
    return {
      props: {
        pageId,
        title: null,
        blocks: [],
        background: null,
        isPublished: false,
        serverRevision: 1,
        publishedRevision: null,
        isAuthenticated: !!userId,
        error: 'not_found',
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
  error,
}: EditorPageProps) {
  // Error state - page not found or not authorized
  if (error) {
    return (
      <>
        <Head>
          <title>Page not found – my corner</title>
        </Head>
        <NotFoundPage 
          slug={pageId} 
          message={error === 'not_authorized' 
            ? "You don't have permission to edit this page." 
            : "This page doesn't exist or you don't have access to it."
          }
        />
      </>
    );
  }
  
  // Render the editor
  return (
    <>
      <Head>
        <title>{title || 'Untitled'} – my corner</title>
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
      />
    </>
  );
}

