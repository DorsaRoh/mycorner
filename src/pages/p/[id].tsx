import { useState } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useMutation } from '@apollo/client';
import { initializeApollo } from '@/lib/apollo';
import { GET_PUBLIC_PAGE, FORK_PAGE, REQUEST_MAGIC_LINK } from '@/lib/graphql/mutations';
import { ViewerCanvas, FloatingAction, FeedbackModal } from '@/components/viewer';
import { PageFlipExplore } from '@/components/editor';
import type { Block, BackgroundConfig } from '@/shared/types';
import styles from '@/styles/ViewPage.module.css';

interface PageData {
  id: string;
  title?: string;
  owner?: {
    id: string;
    displayName?: string;
  };
  blocks: Block[];
  background?: BackgroundConfig;
  createdAt: string;
}

interface ViewPageProps {
  page: PageData | null;
  currentUserId: string | null;
}

export default function ViewPage({ page, currentUserId }: ViewPageProps) {
  const router = useRouter();
  const [forking, setForking] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const [forkPage] = useMutation(FORK_PAGE);
  const [requestMagicLink] = useMutation(REQUEST_MAGIC_LINK);

  if (!page) {
    return (
      <div className={styles.notFound}>
        <h1>Page not found</h1>
        <p>This page doesn&apos;t exist or isn&apos;t published yet.</p>
        <button onClick={() => router.push('/')} className={styles.backBtn}>
          Go home
        </button>
      </div>
    );
  }

  const isOwner = currentUserId && page.owner?.id === currentUserId;

  const handleEdit = () => {
    router.push(`/edit/${page.id}`);
  };

  const handleFork = async () => {
    setForking(true);
    try {
      const { data } = await forkPage({
        variables: { id: page.id },
      });
      if (data?.forkPage?.id) {
        router.push(`/edit/${data.forkPage.id}`);
      }
    } catch (error) {
      console.error('Fork failed:', error);
      setForking(false);
    }
  };

  const handleRequestAuth = async (email: string) => {
    const { data } = await requestMagicLink({
      variables: { email },
    });
    if (!data?.requestMagicLink?.success) {
      throw new Error('Failed to send magic link');
    }
  };

  const pageTitle = page.title || 'Untitled';
  const authorName = page.owner?.displayName || 'Someone';

  return (
    <>
      <Head>
        <title>{pageTitle} – my corner</title>
        <meta name="description" content={`${pageTitle} by ${authorName}`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:type" content="website" />
      </Head>

      <main className={styles.main}>
        {page.title && (
          <header className={styles.header}>
            <h1 className={styles.title}>{page.title}</h1>
          </header>
        )}

        <ViewerCanvas blocks={page.blocks} background={page.background} />

        {/* Feedback link - only show for non-owners */}
        {!isOwner && (
          <button 
            className={styles.feedbackLink}
            onClick={() => setShowFeedback(true)}
          >
            Send feedback
          </button>
        )}

        {/* Page flip for Explore */}
        <PageFlipExplore />

        <FloatingAction
          isOwner={!!isOwner}
          isAuthenticated={!!currentUserId}
          onEdit={handleEdit}
          onFork={handleFork}
          onRequestAuth={handleRequestAuth}
          forking={forking}
        />

        <FeedbackModal
          pageId={page.id}
          isOpen={showFeedback}
          onClose={() => setShowFeedback(false)}
        />
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ViewPageProps> = async (context) => {
  const { id } = context.params as { id: string };
  
  const apolloClient = initializeApollo();

  try {
    const { data } = await apolloClient.query({
      query: GET_PUBLIC_PAGE,
      variables: { id },
      fetchPolicy: 'network-only',
    });

    return {
      props: {
        page: data.publicPage || null,
        currentUserId: data.me?.id || null,
      },
    };
  } catch (error) {
    console.error('Failed to fetch page:', error);
    return {
      props: {
        page: null,
        currentUserId: null,
      },
    };
  }
};
