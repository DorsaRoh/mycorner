/**
 * /new - Draft creator + redirector
 * 
 * ROUTING MODEL:
 * - Creates a draft page in the database
 * - Redirects to /edit/[pageId]
 * - /new is NOT the long-term editor surface
 * 
 * For authenticated users:
 *   - If user already has a page, redirect to it (unless ?fresh=1)
 *   - Otherwise, create a new page with starter content
 * 
 * For anonymous users:
 *   - Create a page with owner_id = draft_token (from cookie)
 *   - On publish, force auth, then "claim" the draft
 * 
 * Query params:
 *   - ?fresh=1 : Force create a new page with fresh starter content
 *                Used after logout to ensure user gets a clean slate
 */

import type { GetServerSideProps } from 'next';
import { 
  getUserIdFromCookies, 
  getDraftOwnerTokenFromCookies,
  buildDraftOwnerTokenCookie,
  generateDraftOwnerToken,
} from '@/server/auth/session';
import { createDraftPage, claimAnonymousPages, createFreshDraftPage } from '@/server/pages';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const cookieHeader = context.req.headers.cookie;
  
  // Check for fresh flag (used after logout)
  const isFresh = context.query.fresh === '1';
  
  if (isFresh && process.env.NODE_ENV === 'development') {
    console.log('[/new] Fresh mode: creating new page with starter content');
  }
  
  // Check if user is authenticated
  // In fresh mode (after logout), we IGNORE the userId to ensure a clean anonymous start
  const rawUserId = await getUserIdFromCookies(cookieHeader);
  const userId = isFresh ? null : rawUserId;
  
  if (isFresh && rawUserId && process.env.NODE_ENV === 'development') {
    console.log('[/new] Fresh mode: ignoring authenticated user, treating as anonymous');
  }
  
  // Get or create draft owner token for anonymous users
  let draftToken = getDraftOwnerTokenFromCookies(cookieHeader);
  
  // In fresh mode OR when no tokens exist (for anonymous users), generate a new draft token
  // This ensures logged-out users get a truly fresh start
  if (!userId && (!draftToken || isFresh)) {
    draftToken = generateDraftOwnerToken();
    // Set cookie on response
    context.res.setHeader('Set-Cookie', buildDraftOwnerTokenCookie(draftToken));
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[/new] Generated new draft token:', draftToken.slice(0, 20) + '...');
    }
  }
  
  try {
    // If user is authenticated and has a draft token, claim any anonymous pages
    // Skip claiming in fresh mode to avoid pulling in old pages
    if (userId && draftToken && !isFresh) {
      await claimAnonymousPages(draftToken, userId);
    }
    
    let result;
    
    if (isFresh) {
      // Fresh mode: always create a new anonymous page with starter content
      // userId is already null due to isFresh check above
      result = await createFreshDraftPage({
        userId: null,
        anonToken: draftToken,
      });
    } else {
      // Normal mode: get existing page or create new one
      result = await createDraftPage({
        userId: userId || null,
        anonToken: !userId ? draftToken : null,
      });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[/new] Redirecting to page:', result.pageId, 'isNew:', result.isNew);
    }
    
    // Redirect to editor with the page ID
    return {
      redirect: {
        destination: `/edit/${result.pageId}`,
        permanent: false,
      },
    };
  } catch (error) {
    console.error('[/new] Error creating draft:', error);
    
    // On error, render the page with an error state
    // Do NOT redirect to /edit - that causes infinite redirect loops
    return {
      props: {
        error: 'Failed to create page. Please try again.',
      },
    };
  }
};

interface NewPageProps {
  error?: string;
}

// This page normally redirects, but renders an error state if something fails
export default function NewPage({ error }: NewPageProps) {
  if (error) {
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
        <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>{error}</p>
        <button 
          onClick={() => window.location.reload()}
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
          Try Again
        </button>
      </div>
    );
  }
  
  // Loading state while redirect happens
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
