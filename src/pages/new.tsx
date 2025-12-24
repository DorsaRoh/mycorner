/**
 * /new - Fresh starter page creator + redirector
 * 
 * ROUTING MODEL:
 * - ALWAYS creates a NEW draft page with fresh starter content
 * - Redirects to /edit/[pageId]
 * - /new is NOT the long-term editor surface
 * 
 * For authenticated users:
 *   - Create a new page with starter content (owned by user)
 * 
 * For anonymous users:
 *   - Create a page with owner_id = draft_token (from cookie)
 *   - On publish, force auth, then "claim" the draft
 * 
 * FRESH START MODE (?fresh=1):
 *   - When fresh=1 query param is present, ignore any existing session
 *   - Always create an anonymous page (as if not logged in)
 *   - This ensures users can start fresh without auto-login to previous accounts
 * 
 * NOTE: /new ALWAYS creates a fresh page. To resume editing an existing page,
 * go directly to /edit/[pageId].
 */

import type { GetServerSideProps } from 'next';
import { 
  getUserIdFromCookies, 
  getDraftOwnerTokenFromCookies,
  buildDraftOwnerTokenCookie,
  generateDraftOwnerToken,
} from '@/server/auth/session';
import { createFreshDraftPage } from '@/server/pages';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const cookieHeader = context.req.headers.cookie;
  
  // Check for fresh=1 flag - if present, ignore any existing session
  // This ensures a completely fresh start without auto-login
  const isFreshStart = context.query.fresh === '1';
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[/new] Creating fresh page with starter content');
    if (isFreshStart) {
      console.log('[/new] Fresh start mode - ignoring existing session');
    }
  }
  
  // Check if user is authenticated (unless fresh start mode)
  // In fresh start mode, always create anonymous page
  const userId = isFreshStart ? null : await getUserIdFromCookies(cookieHeader);
  
  // Get or create draft owner token for anonymous users
  // In fresh start mode, always generate a new token
  let draftToken = isFreshStart ? null : getDraftOwnerTokenFromCookies(cookieHeader);
  
  // For anonymous users (or fresh start), generate a new draft token if none exists
  if (!userId && !draftToken) {
    draftToken = generateDraftOwnerToken();
    // Set cookie on response
    context.res.setHeader('Set-Cookie', buildDraftOwnerTokenCookie(draftToken));
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[/new] Generated new draft token:', draftToken.slice(0, 20) + '...');
    }
  }
  
  try {
    // Always create a fresh page with starter content
    const result = await createFreshDraftPage({
      userId: userId || null,
      anonToken: !userId ? draftToken : null,
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[/new] Created fresh page:', result.pageId);
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
