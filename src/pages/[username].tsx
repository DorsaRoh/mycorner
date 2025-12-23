/**
 * /[username] - public page route
 * 
 * PRODUCTION INVARIANT:
 * this route NEVER reads from the database in production. public pages are
 * served as static HTML from object storage via CDN.
 * 
 * behavior:
 * - production with S3_PUBLIC_BASE_URL: redirect 307 to static HTML in storage
 * - production without S3_PUBLIC_BASE_URL: return 404 (misconfigured deployment)
 * - development: can fall back to DB rendering for convenience
 * 
 * the CDN should be configured to serve /pages/{username}/index.html
 * this Next.js route redirects to the CDN URL.
 */

import type { GetServerSideProps } from 'next';
import { RESERVED_PATHS } from '@/lib/routes';

// =============================================================================
// constants
// =============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// valid username pattern: lowercase alphanumeric with hyphens, 1-64 chars
const USERNAME_PATTERN = /^[a-z0-9-]{1,64}$/;

function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

// =============================================================================
// public pages configuration (no secrets required)
// =============================================================================

function getPublicBaseUrl(): string | null {
  return process.env.S3_PUBLIC_BASE_URL || process.env.PUBLIC_PAGES_BASE_URL || null;
}

function isPublicPagesConfigured(): boolean {
  return !!getPublicBaseUrl();
}

function getStorageUrl(username: string): string | null {
  const publicBaseUrl = getPublicBaseUrl();
  if (!publicBaseUrl) return null;
  return `${publicBaseUrl}/pages/${username}/index.html`;
}

// =============================================================================
// page component (should not render in production)
// =============================================================================

export default function PublicUserPage() {
  // this should not render in production - we always redirect
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <p>Redirecting...</p>
    </div>
  );
}

// =============================================================================
// server-side props
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { username: rawUsername } = context.params as { username: string };
  
  // normalize username to lowercase
  const username = rawUsername.toLowerCase();
  
  // skip reserved paths - let Next.js handle them
  if (RESERVED_PATHS.has(username)) {
    return { notFound: true };
  }
  
  // validate username format early - reject invalid usernames with 404
  if (!isValidUsername(username)) {
    return { notFound: true };
  }
  
  // =========================================================================
  // PRODUCTION PATH: redirect to storage, NEVER read from DB
  // =========================================================================
  if (IS_PRODUCTION) {
    // in production, S3_PUBLIC_BASE_URL must be configured
    // if not, return 404 (deployment is misconfigured)
    if (!isPublicPagesConfigured()) {
      console.error(
        '[/username] FATAL: S3_PUBLIC_BASE_URL not configured in production. ' +
        'public pages cannot be served. this is a deployment error.'
      );
      return { notFound: true };
    }
    
    const storageUrl = getStorageUrl(username);
    if (!storageUrl) {
      // should not happen if isPublicPagesConfigured() returned true
      return { notFound: true };
    }
    
    // redirect to CDN-served static HTML
    // use 307 (temporary) so updates propagate with cache purges
    // do NOT use 301/308 permanent redirects
    return {
      redirect: {
        destination: storageUrl,
        permanent: false,
      },
    };
  }
  
  // =========================================================================
  // DEVELOPMENT PATH: can use storage redirect OR DB fallback
  // =========================================================================
  
  // if storage is configured in dev, redirect to it (same as production)
  if (isPublicPagesConfigured()) {
    const storageUrl = getStorageUrl(username);
    if (storageUrl) {
      return {
        redirect: {
          destination: storageUrl,
          permanent: false,
        },
      };
    }
  }
  
  // development-only fallback: render from database
  // this is for local development convenience when storage is not set up
  try {
    const db = await import('@/server/db');
    
    // get user by username
    const user = await db.getUserByUsername(username);
    if (!user) {
      return { notFound: true };
    }
    
    // get user's pages
    const pages = await db.getPagesByUserId(user.id);
    const page = pages.find(p => p.is_published);
    
    if (!page) {
      return { notFound: true };
    }
    
    // in dev, we can do an inline render
    const { PageDocSchema } = await import('@/lib/schema/page');
    const { renderPageHtml } = await import('@/server/render/renderPageHtml');
    
    // parse the stored doc
    let doc;
    try {
      const content = typeof page.content === 'string' 
        ? JSON.parse(page.content) 
        : page.content;
      const parsed = PageDocSchema.safeParse(content);
      if (parsed.success) {
        doc = parsed.data;
      } else {
        // legacy format - try to convert
        const { convertLegacyPage } = await import('@/lib/schema/page');
        const blocks = Array.isArray(content) ? content : [];
        doc = convertLegacyPage({ 
          title: page.title || undefined, 
          blocks,
          background: page.background ? JSON.parse(page.background) : undefined,
        });
      }
    } catch {
      return { notFound: true };
    }
    
    // render HTML
    const html = renderPageHtml(doc);
    
    // send as raw HTML response
    context.res.setHeader('Content-Type', 'text/html; charset=utf-8');
    context.res.setHeader('Cache-Control', 'public, max-age=60');
    context.res.write(html);
    context.res.end();
    
    return { props: {} };
  } catch (error) {
    console.error('[/username] dev fallback error:', error);
    return { notFound: true };
  }
};
