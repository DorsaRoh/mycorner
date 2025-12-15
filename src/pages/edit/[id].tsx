import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { GET_PAGE } from '@/lib/graphql/mutations';
import { Editor } from '@/components/editor/Editor';
import { isDraftId } from '@/lib/routes';
import styles from '@/styles/EditPage.module.css';

// Force SSR to avoid static generation issues with useRouter
export const getServerSideProps: GetServerSideProps = async () => {
  return { props: {} };
};

/**
 * /edit/:id - Unified editor for both drafts and server pages.
 * 
 * - If ID starts with 'draft_' → load from localStorage (DraftEditor mode)
 * - If ID starts with 'page_' → load from server
 */
export default function EditPage() {
  const router = useRouter();
  const { id } = router.query;
  const pageId = typeof id === 'string' ? id : '';

  // Check if this is a draft or server page
  const isLocalDraft = isDraftId(pageId);

  // Only query server if it's a server page ID
  const { data, loading, error } = useQuery(GET_PAGE, {
    variables: { id: pageId },
    skip: !pageId || isLocalDraft,
  });

  // Still waiting for router to be ready
  if (!pageId) {
    return (
      <div className={styles.loading}>
        <span>Loading...</span>
      </div>
    );
  }

  // For local drafts, render the editor in draft mode
  if (isLocalDraft) {
    return (
      <>
        <Head>
          <title>Edit – my corner</title>
        </Head>
        <Editor pageId={pageId} mode="draft" />
      </>
    );
  }

  // For server pages, wait for data
  if (loading) {
    return (
      <div className={styles.loading}>
        <span>Loading...</span>
      </div>
    );
  }

  // Server page not found - show helpful error
  if (error || !data?.page) {
    return (
      <div className={styles.error}>
        <h1>Page not found</h1>
        <p>This page doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link href="/" className={styles.backBtn}>
          Create a new page
        </Link>
      </div>
    );
  }

  const { page } = data;

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
