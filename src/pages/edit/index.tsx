/**
 * /edit - Authenticated editor page
 * 
 * For editing existing published pages.
 * - If not authenticated → redirect to /new
 * - If authenticated but no page → redirect to /new  
 * - If authenticated with page → load from server and show editor
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Editor } from '@/components/editor/Editor';
import Head from 'next/head';
import styles from '@/styles/EditPage.module.css';

interface PageData {
  id: string;
  title: string | null;
  isPublished: boolean;
  blocks: any[];
  background: any;
  serverRevision: number;
  publishedRevision: number | null;
}

interface MyPageResponse {
  page: PageData | null;
  user: { id: string; username?: string } | null;
}

export default function EditPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);

  // Fetch user's page data
  const fetchMyPage = useCallback(async (): Promise<MyPageResponse> => {
    try {
      const response = await fetch('/api/my-page');
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[EditPage] Failed to fetch page:', err);
      return { page: null, user: null };
    }
  }, []);

  // Load page data
  useEffect(() => {
    if (!router.isReady) return;
    
    fetchMyPage().then((data) => {
      setLoading(false);
      
      // Not authenticated - go to /new
      if (!data.user) {
        console.log('[EditPage] Not authenticated, redirecting to /new');
        router.replace('/new');
        return;
      }
      
      // Authenticated but no page - go to /new (to create one)
      if (!data.page) {
        console.log('[EditPage] User has no published page, redirecting to /new');
        if (process.env.NODE_ENV === 'development') {
          setDebugInfo({
            userId: data.user.id,
            username: data.user.username,
            hint: 'User is authenticated but has no published page. They need to publish from /new first.',
          });
          setError('No published page found. Redirecting to create one...');
          // Delay redirect slightly so user can see the message in dev
          setTimeout(() => router.replace('/new'), 2000);
          return;
        }
        router.replace('/new');
        return;
      }
      
      // Has page, ready to edit
      console.log('[EditPage] Page loaded:', data.page.id);
      setPage(data.page);
      setIsReady(true);
    });
  }, [fetchMyPage, router]);

  // Loading state
  if (loading || !isReady) {
    return (
      <>
        <Head>
          <title>Edit – my corner</title>
        </Head>
        <div className={styles.loading}>
          {error ? (
            <>
              <span style={{ color: '#ff6b6b', marginBottom: '8px' }}>{error}</span>
              {debugInfo && process.env.NODE_ENV === 'development' && (
                <pre style={{ 
                  fontSize: '11px', 
                  opacity: 0.7, 
                  marginTop: '16px',
                  background: 'rgba(0,0,0,0.1)',
                  padding: '12px',
                  borderRadius: '8px',
                  maxWidth: '400px',
                  overflow: 'auto'
                }}>
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              )}
            </>
          ) : (
            <span>Loading your space...</span>
          )}
        </div>
      </>
    );
  }

  if (!page) {
    return (
      <>
        <Head>
          <title>Edit – my corner</title>
        </Head>
        <div className={styles.loading}>
          <span>No page found. Redirecting...</span>
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
        initialTitle={page.title || ''}
        initialBackground={page.background}
        initialPublished={page.isPublished}
        initialServerRevision={page.serverRevision ?? 1}
        initialPublishedRevision={page.publishedRevision ?? null}
      />
    </>
  );
}
