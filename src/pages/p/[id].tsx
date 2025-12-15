import { useState, useCallback, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { initializeApollo } from '@/lib/apollo/client';
import { GET_PUBLIC_PAGE } from '@/lib/graphql/mutations';
import { ViewerCanvas } from '@/components/viewer/ViewerCanvas';
import { FloatingAction } from '@/components/viewer/FloatingAction';
import { getBackgroundBrightness } from '@/shared/utils/blockStyles';
import { routes, getPublicUrl } from '@/lib/routes';
import type { Block, BackgroundConfig } from '@/shared/types';
import styles from '@/styles/ViewPage.module.css';

interface PageData {
  id: string;
  title?: string;
  isPublished: boolean;
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
  pageExists: boolean;
  currentUserId: string | null;
}

export default function ViewPage({ page, pageExists, currentUserId }: ViewPageProps) {
  const router = useRouter();
  const { id } = router.query;
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof id === 'string' ? getPublicUrl(id) : '';

  // Reset copied state
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
    } catch {
      const input = document.createElement('input');
      input.value = publicUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
    }
  }, [publicUrl]);

  const isOwner = currentUserId && page?.owner?.id === currentUserId;

  const handleEdit = () => {
    if (page) {
      router.push(routes.edit(page.id));
    }
  };

  // Page exists but is not published yet
  if (pageExists && (!page || !page.isPublished)) {
    return (
      <>
        <Head>
          <title>Not published yet – my corner</title>
        </Head>
        <div className={styles.notFound}>
          <h1>Not published yet</h1>
          <p>This page hasn&apos;t been published yet.</p>
          {isOwner ? (
            <Link href={routes.edit(id as string)} className={styles.backBtn}>
              Publish now
            </Link>
          ) : (
            <Link href={routes.home()} className={styles.backBtn}>
              Go home
            </Link>
          )}
        </div>
      </>
    );
  }

  // Page doesn't exist at all
  if (!page) {
    return (
      <>
        <Head>
          <title>Page not found – my corner</title>
        </Head>
        <div className={styles.notFound}>
          <h1>Page not found</h1>
          <p>This page doesn&apos;t exist.</p>
          <Link href={routes.home()} className={styles.backBtn}>
            Want your own corner of the internet?
          </Link>
        </div>
      </>
    );
  }

  const pageTitle = page.title || 'Untitled';
  const authorName = page.owner?.displayName || 'Someone';
  const backgroundBrightness = getBackgroundBrightness(page.background);

  return (
    <>
      <Head>
        <title>{pageTitle} – my corner</title>
        <meta name="description" content={`${pageTitle} by ${authorName}`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:type" content="website" />
      </Head>

      <main className={`${styles.main} ${backgroundBrightness === 'dark' ? styles.darkBg : styles.lightBg}`}>
        {page.title && (
          <header className={styles.header}>
            <h1 className={styles.title}>{page.title}</h1>
          </header>
        )}

        <ViewerCanvas blocks={page.blocks} background={page.background} />

        {/* Share button - subtle */}
        <button 
          className={styles.copyLink}
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Share'}
        </button>

        {/* Want your own corner link - top right with logo */}
        <Link href={routes.home()} className={styles.createOwn}>
          <Image src="/logo.png" alt="" width={18} height={18} className={styles.createOwnLogo} />
          Want your own corner of the internet?
        </Link>

        <FloatingAction
          isOwner={!!isOwner}
          onEdit={handleEdit}
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

    // Check if page exists but is just not published
    const pageExists = data.publicPage !== null || data.page !== null;

    return {
      props: {
        page: data.publicPage || null,
        pageExists,
        currentUserId: data.me?.id || null,
      },
    };
  } catch (error) {
    console.error('Failed to fetch page:', error);
    return {
      props: {
        page: null,
        pageExists: false,
        currentUserId: null,
      },
    };
  }
};
