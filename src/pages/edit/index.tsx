import { useEffect, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useRouter } from 'next/router';
import { GET_MY_PAGE } from '@/lib/graphql/mutations';
import { getActiveDraftId, generateDraftId, setActiveDraftId, clearAuthContinuation, clearAllDrafts } from '@/lib/draft/storage';
import { Editor } from '@/components/editor/Editor';
import Head from 'next/head';
import styles from '@/styles/EditPage.module.css';

const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      name
      username
      avatarUrl
    }
  }
`;

/**
 * /edit - Canonical editor page
 * 
 * This is the single entry point for editing. The URL is always /edit.
 * Internally resolves which page to load:
 * 1. If ?fresh=1 → always create a fresh new draft (for "make your own corner" CTA)
 * 2. If authenticated with existing server page → load that
 * 3. If has active draft in localStorage → load that
 * 4. Otherwise → create new draft
 */
export default function EditPage() {
  const router = useRouter();
  const [resolvedPageId, setResolvedPageId] = useState<string | null>(null);
  const [mode, setMode] = useState<'draft' | 'server' | null>(null);
  const [freshModeHandled, setFreshModeHandled] = useState(false);
  
  // Check for fresh param - when set, always create a new fresh draft
  const isFresh = router.query.fresh === '1';
  
  // Check authentication status
  const { data: meData, loading: meLoading } = useQuery(ME_QUERY, {
    fetchPolicy: 'network-only',
  });
  const isAuthenticated = !!meData?.me;
  
  // Check if user has an existing server page
  const { data, loading: queryLoading } = useQuery(GET_MY_PAGE, {
    fetchPolicy: 'network-only',
    // Skip the query if we're creating a fresh page
    skip: isFresh,
  });

  // Resolve which page to load
  useEffect(() => {
    // Wait for router to be ready so we can check query params
    if (!router.isReady) return;
    
    // Wait for auth check to complete
    if (meLoading) return;
    
    // Priority 0: Fresh mode - always create a new draft
    if (isFresh) {
      clearAuthContinuation();
      const newDraftId = generateDraftId();
      // Only set active draft ID if authenticated
      if (isAuthenticated) {
        setActiveDraftId(newDraftId);
      }
      setResolvedPageId(newDraftId);
      setMode('draft');
      setFreshModeHandled(true);
      // Clear the fresh param from URL without triggering a reload
      router.replace('/edit', undefined, { shallow: true });
      return;
    }
    
    // If we just handled fresh mode, don't re-resolve even if fresh param is gone
    if (freshModeHandled) return;
    
    if (queryLoading) return;

    // Priority 1: User has an existing published page (only when authenticated)
    // myPage now returns the most recently published page, or null if none exist
    if (isAuthenticated && data?.myPage?.id) {
      setResolvedPageId(data.myPage.id);
      setMode('server');
      return;
    }

    // Priority 2: Create a new draft with starter template
    // This happens when:
    // - User is authenticated but has no published pages (myPage is null)
    // - User is authenticated and never published before
    if (isAuthenticated) {
      clearAuthContinuation();
      const newDraftId = generateDraftId();
      setActiveDraftId(newDraftId);
      setResolvedPageId(newDraftId);
      setMode('draft');
      return;
    }

    // Priority 3: Not authenticated - redirect to landing page
    router.replace('/');
  }, [data, queryLoading, isFresh, freshModeHandled, router.isReady, router, isAuthenticated, meLoading]);

  // Still resolving...
  if (!resolvedPageId || !mode) {
    return (
      <>
        <Head>
          <title>Edit – my corner</title>
        </Head>
        <div className={styles.loading}>
          <span>Loading your space...</span>
        </div>
      </>
    );
  }

  // Draft mode - render editor directly
  if (mode === 'draft') {
    return (
      <>
        <Head>
          <title>Edit – my corner</title>
        </Head>
        <Editor pageId={resolvedPageId} mode="draft" />
      </>
    );
  }

  // Server mode - render with server data
  const page = data?.myPage;
  if (!page) {
    return (
      <>
        <Head>
          <title>Edit – my corner</title>
        </Head>
        <div className={styles.loading}>
          <span>Loading your space...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{page.title || 'Untitled'} – my corner</title>
      </Head>
      <Editor
        pageId={page.id}
        mode="server"
        initialBlocks={page.blocks}
        initialTitle={page.title}
        initialBackground={page.background}
        initialPublished={page.isPublished}
        initialServerRevision={page.serverRevision ?? 1}
        initialPublishedRevision={page.publishedRevision ?? null}
      />
    </>
  );
}
