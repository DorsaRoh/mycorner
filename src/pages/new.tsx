/**
 * /new - Fresh starter page creator + redirector
 * 

* ROUTING MODEL:
 * - ALWAYS creates a NEW anonymous draft page with fresh starter content
 * - Redirects to /edit/[pageId]
 * - /new is NOT the long-term editor surface
 * - Session state is IGNORED - user can sign in from the edit page
 * 
 * DESIGN DECISION:
 * We ALWAYS create anonymous pages on /new to ensure:
 * 1. Reliability - no FK constraint issues with stale session cookies
 * 2. Fresh start - users get a clean slate every time
 * 3. Sign-in flow - users can sign in from edit page and page gets claimed
 * 
 * To resume editing an existing page, go directly to /edit/[pageId].
 */

import type { GetServerSideProps } from 'next';
import { 
  getDraftOwnerTokenFromCookies,
  buildDraftOwnerTokenCookie,
  generateDraftOwnerToken,
} from '@/server/auth/session';
import { createFreshDraftPage } from '@/server/pages';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const cookieHeader = context.req.headers.cookie;
  
  // Prevent caching of this page - always needs fresh execution
  context.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  context.res.setHeader('Pragma', 'no-cache');
  context.res.setHeader('Expires', '0');
  
  console.log('[/new] Creating fresh anonymous page with starter content');
  
  // ALWAYS create anonymous page - session state is ignored
  // This ensures /new works reliably regardless of cookie state
  // Users can sign in from the edit page and claim the page
  
  // Get existing draft token or generate a new one
  let draftToken = getDraftOwnerTokenFromCookies(cookieHeader);
  
  // If no draft token exists, generate a fresh one
  // This ensures every /new request has a valid owner token
  if (!draftToken) {
    draftToken = generateDraftOwnerToken();
    console.log('[/new] Generated new draft token:', draftToken.slice(0, 20) + '...');
  } else {
    // Even if token exists, generate a NEW one to prevent reusing old drafts
    // This ensures each /new creates a truly fresh page
    draftToken = generateDraftOwnerToken();
    console.log('[/new] Generated fresh draft token (replacing old):', draftToken.slice(0, 20) + '...');
  }
  
  // Set the cookie for the new draft token
  const cookie = buildDraftOwnerTokenCookie(draftToken);
  context.res.setHeader('Set-Cookie', cookie);
  console.log('[/new] Set draft token cookie');
  
  try {
    // Create an anonymous page - no userId, just anonToken
    const result = await createFreshDraftPage({
      userId: null,
      anonToken: draftToken,
    });
    
    console.log('[/new] Created fresh page:', result.pageId, 'with token:', draftToken.slice(0, 20));
    
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
