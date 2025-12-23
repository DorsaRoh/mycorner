/**
 * /new - Anonymous editor page
 * 
 * VIRAL LOOP ENTRY POINT:
 * 1. User arrives (from CTA on another page or landing)
 * 2. Edits their corner locally (localStorage)
 * 3. Clicks Publish → triggers auth if needed
 * 4. After auth, immediately publishes (NO username step)
 * 5. Redirects to /u/[slug]
 * 
 * Draft storage: localStorage key 'yourcorner:draft:v1'
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery, gql } from '@apollo/client';
import Head from 'next/head';
import { Editor } from '@/components/editor/Editor';
import { AuthGate } from '@/components/editor/AuthGate';
import { clearDraft, migrateLegacyDraft, loadEditorDraft, getDraftAsPageDoc } from '@/lib/draft';
import { createStarterBlocks, DEFAULT_STARTER_BACKGROUND } from '@/lib/starter';
import styles from '@/styles/EditPage.module.css';

const ME_QUERY = gql`
  query Me {
    me {
      id
    }
  }
`;

// =============================================================================
// Page Component
// =============================================================================

export default function NewPage() {
  const router = useRouter();
  const [draftId] = useState('draft-v1'); // Single draft ID
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [initialBlocks, setInitialBlocks] = useState<any[]>([]);
  const [initialTitle, setInitialTitle] = useState('');
  const [initialBackground, setInitialBackground] = useState(DEFAULT_STARTER_BACKGROUND);
  const [initialized, setInitialized] = useState(false);
  
  // Check auth status
  const { data: meData, loading: meLoading, refetch: refetchMe } = useQuery(ME_QUERY, {
    fetchPolicy: 'network-only',
  });
  
  const isAuthenticated = !!meData?.me;
  
  // Migrate legacy drafts on first load
  const migrationDone = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (migrationDone.current) return;
    migrationDone.current = true;
    migrateLegacyDraft();
  }, []);
  
  // Initialize from draft storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initialized) return;
    
    const draft = loadEditorDraft();
    if (draft) {
      // Load from draft storage (already in legacy format for Editor)
      setInitialTitle(draft.title || '');
      setInitialBlocks(draft.blocks || []);
      setInitialBackground(DEFAULT_STARTER_BACKGROUND);
    } else {
      // No draft, use starter blocks (default to desktop layout)
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      setInitialBlocks(createStarterBlocks(isMobile));
      setInitialTitle('');
      setInitialBackground(DEFAULT_STARTER_BACKGROUND);
    }
    
    setInitialized(true);
  }, [initialized]);
  
  // Handle publish flow
  const handlePublishFlow = useCallback(async () => {
    setPublishing(true);
    setPublishError(null);
    
    try {
      // Re-check auth
      const { data: freshMe } = await refetchMe();
      const authed = !!freshMe?.me;
      
      if (!authed) {
        // Need auth first
        setShowAuthGate(true);
        setPublishing(false);
        return;
      }
      
      // Get current draft as PageDoc format
      const doc = getDraftAsPageDoc();
      if (!doc) {
        setPublishError('No draft found. Please add some content first.');
        setPublishing(false);
        return;
      }
      
      // Call new publish API
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        setPublishError(result.error || 'Failed to publish. Please try again.');
        setPublishing(false);
        return;
      }
      
      // Clear draft
      clearDraft();
      
      // Redirect to published page
      router.push(`/u/${result.slug}`);
      
    } catch (error) {
      console.error('Publish error:', error);
      setPublishError('Network error. Please try again.');
      setPublishing(false);
    }
  }, [refetchMe, router]);
  
  // Check for ?publish=1 query param (after auth redirect)
  useEffect(() => {
    if (!router.isReady || meLoading) return;
    
    const shouldPublish = router.query.publish === '1';
    if (shouldPublish && isAuthenticated) {
      // Clear the query param
      router.replace('/new', undefined, { shallow: true });
      // Immediately publish
      handlePublishFlow();
    }
  }, [router.isReady, router.query.publish, isAuthenticated, meLoading, router, handlePublishFlow]);
  
  // Handle auth gate redirect
  const handleAuthStart = useCallback(() => {
    window.location.href = `/auth/google?returnTo=/new?publish=1`;
  }, []);
  
  // Loading state
  if (!initialized) {
    return (
      <>
        <Head>
          <title>Create your corner – YourCorner</title>
        </Head>
        <div className={styles.loading}>
          <span>Loading...</span>
        </div>
      </>
    );
  }
  
  // Publishing state
  if (publishing) {
    return (
      <>
        <Head>
          <title>Publishing... – YourCorner</title>
        </Head>
        <div className={styles.loading}>
          <span>Publishing your corner...</span>
        </div>
      </>
    );
  }
  
  return (
    <>
      <Head>
        <title>Create your corner – YourCorner</title>
        <meta name="description" content="Create your own corner of the internet. Free, no ads, takes 2 minutes." />
      </Head>
      
      <Editor
        pageId={draftId}
        mode="draft"
        initialBlocks={initialBlocks}
        initialTitle={initialTitle}
        initialBackground={initialBackground}
      />
      
      {publishError && (
        <div className={styles.errorToast}>
          {publishError}
          <button onClick={() => setPublishError(null)}>×</button>
        </div>
      )}
      
      <AuthGate
        isOpen={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        onAuthStart={handleAuthStart}
        title="Sign in to publish"
        subtitle="Create your corner of the internet. It's free and takes 2 minutes."
      />
    </>
  );
}
