/**
 * /new - Draft creator + redirector
 * 
 * ROUTING MODEL:
 * - Creates a draft page in the database
 * - Redirects to /edit/[pageId]
 * - /new is NOT the long-term editor surface
 * 
 * For authenticated users:
 *   - If user already has a page, redirect to it
 *   - Otherwise, create a new page with starter content
 * 
 * For anonymous users:
 *   - Create a page with owner_id = draft_token (from cookie)
 *   - On publish, force auth, then "claim" the draft
 */

import type { GetServerSideProps } from 'next';
import { 
  getUserIdFromCookies, 
  getDraftOwnerTokenFromCookies,
  buildDraftOwnerTokenCookie,
  generateDraftOwnerToken,
} from '@/server/auth/session';
import { createDraftPage, claimAnonymousPages } from '@/server/pages';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const cookieHeader = context.req.headers.cookie;
  
  // Check if user is authenticated
  const userId = await getUserIdFromCookies(cookieHeader);
  
  // Get or create draft owner token for anonymous users
  let draftToken = getDraftOwnerTokenFromCookies(cookieHeader);
  
  if (!userId && !draftToken) {
    // Generate new draft token for anonymous user
    draftToken = generateDraftOwnerToken();
    // Set cookie on response
    context.res.setHeader('Set-Cookie', buildDraftOwnerTokenCookie(draftToken));
  }
  
  try {
    // If user is authenticated and has a draft token, claim any anonymous pages
    if (userId && draftToken) {
      await claimAnonymousPages(draftToken, userId);
    }
    
    // Create or get existing draft page
    const result = await createDraftPage({
      userId: userId || null,
      anonToken: !userId ? draftToken : null,
    });
    
    // Redirect to editor with the page ID
    return {
      redirect: {
        destination: `/edit/${result.pageId}`,
        permanent: false,
      },
    };
  } catch (error) {
    console.error('[/new] Error creating draft:', error);
    
    // If something goes wrong, still try to redirect somewhere sensible
    return {
      redirect: {
        destination: '/edit',
        permanent: false,
      },
    };
  }
};

// This page should never render - it always redirects
export default function NewPage() {
  return null;
}
