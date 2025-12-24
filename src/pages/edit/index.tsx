/**
 * /edit - Authenticated user's page resolver
 * 
 * SIMPLE MODEL:
 * - Logged in with a page → redirect to /edit/[pageId]
 * - Logged in without a page → redirect to /new
 * - Not logged in → redirect to /new
 */

import type { GetServerSideProps } from 'next';
import { getUserIdFromCookies } from '@/server/auth/session';
import { getUserPrimaryPageId } from '@/server/pages';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const cookieHeader = context.req.headers.cookie;
  
  // Prevent caching
  context.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  // Check if user is authenticated
  const userId = await getUserIdFromCookies(cookieHeader);
  
  if (!userId) {
    // Not logged in → /new
    return {
      redirect: {
        destination: '/new',
        permanent: false,
      },
    };
  }
  
  // User is authenticated - find their page
  try {
    const pageId = await getUserPrimaryPageId(userId);
    
    if (pageId) {
      // User has a page - go to it
      return {
        redirect: {
          destination: `/edit/${pageId}`,
          permanent: false,
        },
      };
    }
    
    // User has no pages - go to /new to create one
    return {
      redirect: {
        destination: '/new',
        permanent: false,
      },
    };
  } catch (error) {
    console.error('[/edit] Error resolving primary page:', error);
    // On error, go to /new
    return {
      redirect: {
        destination: '/new',
        permanent: false,
      },
    };
  }
};

// This page should never render - it always redirects
export default function EditPage() {
  return null;
}
