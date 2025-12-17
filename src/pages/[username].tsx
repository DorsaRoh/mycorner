import { GetServerSideProps } from 'next';
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { gql } from '@apollo/client';
import { initializeApollo } from '@/lib/apollo/client';
import { ViewerCanvas } from '@/components/viewer/ViewerCanvas';
import { FloatingAction } from '@/components/viewer/FloatingAction';
import { ShareMenu } from '@/components/viewer/ShareMenu';
import { AuthGate } from '@/components/editor/AuthGate';
import { getBackgroundBrightness } from '@/shared/utils/blockStyles';
import { routes, auth } from '@/lib/routes';
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
        rotation
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
  const [showAuthGate, setShowAuthGate] = useState(false);

  // Build public URL
  const publicUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}${routes.user(username)}`
    : routes.user(username);

  const isOwner = currentUserId && page?.owner?.id === currentUserId;

  const handleEdit = () => {
    // Navigate to edit page (user's own page)
    router.push(routes.edit());
  };

  const handleCTAClick = () => {
    if (currentUserId) {
      // Already authenticated - go directly to /edit
      router.push(routes.edit());
    } else {
      // Not authenticated - show auth gate modal
      setShowAuthGate(true);
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
          <button onClick={handleCTAClick} className={styles.backBtn}>
            Want your own corner of the internet?
          </button>
        </div>
        
        <AuthGate
          isOpen={showAuthGate}
          onClose={() => setShowAuthGate(false)}
        />
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

        {/* Header group - top right with CTA and Share */}
        <div className={styles.headerGroup}>
          <button onClick={handleCTAClick} className={styles.headerCta}>
            <img src="/logo.png" alt="" width={18} height={18} className={styles.headerCtaLogo} />
            Want your own corner of the internet?
          </button>
          <ShareMenu url={publicUrl} title={pageTitle} />
        </div>

        <FloatingAction
          isOwner={!!isOwner}
          onEdit={handleEdit}
        />
        
        <AuthGate
          isOpen={showAuthGate}
          onClose={() => setShowAuthGate(false)}
        />
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<UserPageProps> = async (context) => {
  const { username } = context.params as { username: string };
  
  // Import centralized RESERVED_PATHS (can't use routes module in SSR context directly)
  const RESERVED_PATHS = new Set([
    'edit', 'api', 'auth', 'graphql', 'health', '_next', 'static',
    'favicon.ico', 'robots.txt', 'sitemap.xml', 'p', 'u', 'onboarding',
    'admin', 'settings', 'login', 'logout', 'signup', 'register',
    'terms', 'privacy', 'about', 'help', 'support', 'blog', 'docs',
    'null', 'undefined', 'new', 'create', 'me', 'public', 'assets',
  ]);
  
  // Skip reserved paths - let Next.js handle them
  if (RESERVED_PATHS.has(username.toLowerCase())) {
    return { notFound: true };
  }
  
  const apolloClient = initializeApollo();

  try {
    const { data } = await apolloClient.query({
      query: GET_PAGE_BY_USERNAME,
      variables: { username: username.toLowerCase() },
      fetchPolicy: 'network-only',
    });

    // If page doesn't exist or isn't published, return 404-like state
    // but still render so we can show a nice "not found" page
    return {
      props: {
        page: data.pageByUsername?.isPublished ? data.pageByUsername : null,
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

