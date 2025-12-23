/**
 * /edit - Authenticated editor page
 * 
 * For editing existing published pages.
 * - If not authenticated → redirect to /new
 * - If authenticated but no page → redirect to /new  
 * - If authenticated with page → load from server and show editor
 */

import { useEffect, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useRouter } from 'next/router';
import { GET_MY_PAGE } from '@/lib/graphql/mutations';
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

export default function EditPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  
  // Check authentication status
  const { data: meData, loading: meLoading } = useQuery(ME_QUERY, {
    fetchPolicy: 'network-only',
  });
  const isAuthenticated = !!meData?.me;
  
  // Check if user has an existing server page
  const { data: pageData, loading: pageLoading } = useQuery(GET_MY_PAGE, {
    fetchPolicy: 'network-only',
    skip: !isAuthenticated,
  });

  // Handle redirects
  useEffect(() => {
    if (meLoading) return;
    
    // Not authenticated - go to /new
    if (!isAuthenticated) {
      router.replace('/new');
      return;
    }
    
    if (pageLoading) return;
    
    // Authenticated but no page - go to /new
    if (!pageData?.myPage) {
      router.replace('/new');
      return;
    }
    
    // Has page, ready to edit
    setIsReady(true);
  }, [meLoading, pageLoading, isAuthenticated, pageData, router]);

  // Loading state
  if (!isReady) {
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

  const page = pageData?.myPage;
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
