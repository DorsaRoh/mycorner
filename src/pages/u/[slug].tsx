/**
 * /u/[slug] - Public page route
 * 
 * PRODUCTION INVARIANT:
 * This route NEVER reads from the database in production. Public pages are
 * served as static HTML from object storage via CDN.
 * 
 * Behavior:
 * - Production with S3_PUBLIC_BASE_URL: redirect 307 to static HTML in storage
 * - Production without S3_PUBLIC_BASE_URL: return 404 (misconfigured deployment)
 * - Development: can fall back to DB rendering for convenience
 * 
 * The CDN should be configured to serve /pages/{slug}/index.html
 * This Next.js route redirects to the CDN URL.
 * 
 * IMPORTANT: This route checks ONLY S3_PUBLIC_BASE_URL (public config).
 * It does NOT require S3_SECRET_ACCESS_KEY or other upload credentials.
 */

import { GetServerSideProps } from 'next';

// =============================================================================
// Constants
// =============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// =============================================================================
// Slug Validation
// =============================================================================

/** Valid slug pattern: lowercase alphanumeric with hyphens, 1-64 chars */
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

// =============================================================================
// Public Pages Configuration (no secrets required)
// =============================================================================

function getPublicBaseUrl(): string | null {
  return process.env.S3_PUBLIC_BASE_URL || process.env.PUBLIC_PAGES_BASE_URL || null;
}

function isPublicPagesConfigured(): boolean {
  return !!getPublicBaseUrl();
}

function getStorageUrl(slug: string): string | null {
  const publicBaseUrl = getPublicBaseUrl();
  if (!publicBaseUrl) return null;
  return `${publicBaseUrl}/pages/${slug}/index.html`;
}

// =============================================================================
// Page Component (should not render in production)
// =============================================================================

export default function PublicPageRedirect() {
  // This should not render in production - we always redirect
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
// Server-Side Props
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug } = context.params as { slug: string };
  
  // normalize slug to lowercase
  const normalizedSlug = slug.toLowerCase();
  
  // validate slug format early - reject invalid slugs with 404
  if (!isValidSlug(normalizedSlug)) {
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
        '[/u/slug] FATAL: S3_PUBLIC_BASE_URL not configured in production. ' +
        'Public pages cannot be served. This is a deployment error.'
      );
      return { notFound: true };
    }
    
    const storageUrl = getStorageUrl(normalizedSlug);
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
    const storageUrl = getStorageUrl(normalizedSlug);
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
    const page = await db.getPageBySlug(normalizedSlug);
    
    if (!page || !page.is_published) {
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
    console.error('[/u/slug] Dev fallback error:', error);
    return { notFound: true };
  }
};
