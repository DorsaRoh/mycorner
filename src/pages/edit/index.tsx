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

  // Fetch user's page data
  const fetchMyPage = useCallback(async (): Promise<MyPageResponse> => {
    try {
      const response = await fetch('/api/my-page');
      const data = await response.json();
      return data;
    } catch {
      return { page: null, user: null };
    }
  }, []);

  // Load page data
  useEffect(() => {
    fetchMyPage().then((data) => {
      setLoading(false);
      
      // Not authenticated - go to /new
      if (!data.user) {
        router.replace('/new');
        return;
      }
      
      // Authenticated but no page - go to /new
      if (!data.page) {
        router.replace('/new');
        return;
      }
      
      // Has page, ready to edit
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
          <span>Loading your space...</span>
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
        initialTitle={page.title || ''}
        initialBackground={page.background}
        initialPublished={page.isPublished}
        initialServerRevision={page.serverRevision ?? 1}
        initialPublishedRevision={page.publishedRevision ?? null}
      />
    </>
  );
}
