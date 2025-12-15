import { useState, useCallback, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { gql } from '@apollo/client';
import { initializeApollo } from '@/lib/apollo/client';
import { ViewerCanvas } from '@/components/viewer/ViewerCanvas';
import { FloatingAction } from '@/components/viewer/FloatingAction';
import { getBackgroundBrightness } from '@/shared/utils/blockStyles';
import { routes } from '@/lib/routes';
import type { Block, BackgroundConfig } from '@/shared/types';
import styles from '@/styles/ViewPage.module.css';

const GET_PAGE_BY_USERNAME = gql`
  query GetPageByUsername($username: String!) {
    pageByUsername(username: $username) {
      id
      title
      slug
      isPublished
      owner {
        id
        name
        username
        avatarUrl
      }
      blocks {
        id
        type
        x
        y
        width
        height
        content
        style {
          borderRadius
          shadowStrength
          shadowSoftness
          shadowOffsetX
          shadowOffsetY
          fontFamily
          fontSize
          fontWeight
          color
          textOpacity
          textAlign
        }
        effects {
          brightness
          contrast
          saturation
          hueShift
          blur
        }
      }
      background {
        mode
        solid { color }
        gradient { type colorA colorB angle }
      }
      createdAt
    }
    me { id }
  }
`;

interface PageOwner {
  id: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
}

interface PageData {
  id: string;
  title?: string;
  slug?: string;
  isPublished: boolean;
  owner?: PageOwner;
  blocks: Block[];
  background?: BackgroundConfig;
  createdAt: string;
}

interface UserPageProps {
  page: PageData | null;
  username: string;
  currentUserId: string | null;
}

export default function UserPage({ page, username, currentUserId }: UserPageProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/u/${username}` 
    : `/u/${username}`;

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

  // Page doesn't exist
  if (!page) {
    return (
      <>
        <Head>
          <title>@{username} – not found</title>
        </Head>
        <div className={styles.notFound}>
          <h1>@{username}</h1>
          <p>This page doesn&apos;t exist yet.</p>
          <Link href={routes.new()} className={styles.backBtn}>
            Want your own corner of the internet?
          </Link>
        </div>
      </>
    );
  }

  const pageTitle = page.title || `@${username}'s corner`;
  const authorName = page.owner?.name || page.owner?.username || username;
  const backgroundBrightness = getBackgroundBrightness(page.background);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={`${pageTitle} by ${authorName}`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={publicUrl} />
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
        <Link href={routes.new()} className={styles.createOwn}>
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

export const getServerSideProps: GetServerSideProps<UserPageProps> = async (context) => {
  const { username } = context.params as { username: string };
  
  const apolloClient = initializeApollo();

  try {
    const { data } = await apolloClient.query({
      query: GET_PAGE_BY_USERNAME,
      variables: { username: username.toLowerCase() },
      fetchPolicy: 'network-only',
    });

    return {
      props: {
        page: data.pageByUsername || null,
        username,
        currentUserId: data.me?.id || null,
      },
    };
  } catch (error) {
    console.error('Failed to fetch page:', error);
    return {
      props: {
        page: null,
        username,
        currentUserId: null,
      },
    };
  }
};
