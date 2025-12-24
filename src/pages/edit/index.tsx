/**
 * /edit - Authenticated editor resolver
 * 
 * ROUTING MODEL:
 * - If not logged in → show sign-in UI or redirect to login with returnTo=/edit
 * - If logged in → resolve pageId = getUserPrimaryPageId(userId)
 *   - If pageId exists → redirect to /edit/[pageId]
 *   - Else → redirect to /new (to create a draft)
 * 
 * No blank page. No silent null render.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getUserIdFromCookies } from '@/server/auth/session';
import { getUserPrimaryPageId } from '@/server/pages';
import { AuthGate } from '@/components/editor/AuthGate';
import styles from '@/styles/EditPage.module.css';

interface EditPageProps {
  isAuthenticated: boolean;
  error?: string;
}

export const getServerSideProps: GetServerSideProps<EditPageProps> = async (context) => {
  const cookieHeader = context.req.headers.cookie;
  
  // Check if user is authenticated
  const userId = await getUserIdFromCookies(cookieHeader);
  
  if (!userId) {
    // Not authenticated - render the page with auth gate
    return {
      props: {
        isAuthenticated: false,
      },
    };
  }
  
  // User is authenticated - resolve their primary page
  try {
    const pageId = await getUserPrimaryPageId(userId);
    
    if (pageId) {
      // User has a page - redirect to it
      return {
        redirect: {
          destination: `/edit/${pageId}`,
          permanent: false,
        },
      };
    }
    
    // User has no pages - redirect to /new to create one
    return {
      redirect: {
        destination: '/new',
        permanent: false,
      },
    };
  } catch (error) {
    console.error('[/edit] Error resolving primary page:', error);
    
    // On error, render the page with an error state
    // Do NOT redirect to /new - that causes infinite redirect loops
    return {
      props: {
        isAuthenticated: true,
        error: 'Failed to load your page. Please try again.',
      },
    };
  }
};

export default function EditPage({ isAuthenticated, error }: EditPageProps) {
  const router = useRouter();
  const [showAuthGate] = useState(!isAuthenticated);
  
  // After auth, this page will reload via getServerSideProps and redirect
  useEffect(() => {
    if (isAuthenticated && !error) {
      // This shouldn't happen - SSR should have redirected
      // But if it does, refresh to trigger the redirect
      router.replace('/edit');
    }
  }, [isAuthenticated, error, router]);
  
  // Show error state if there was a database error
  if (error) {
    return (
      <>
        <Head>
          <title>My Corner - Error</title>
        </Head>
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
      </>
    );
  }
  
  // Not authenticated - show auth gate
  return (
    <>
      <Head>
        <title>My Corner</title>
      </Head>
      <div className={styles.loading}>
        <span>Sign in to edit your corner</span>
      </div>
      
      <AuthGate
        isOpen={showAuthGate}
        onClose={() => {
          // If they close the gate, redirect to /new where they can edit anonymously
          router.push('/new');
        }}
        draftId=""
        onAuthStart={() => {}}
        returnTo="/edit"
      />
    </>
  );
}
