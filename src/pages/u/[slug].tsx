/**
 * /u/[slug] - Public page route
 * 
 * PRODUCTION ARCHITECTURE:
 * This route does NOT render pages server-side. Public pages are served
 * as static HTML from object storage via CDN.
 * 
 * Behavior:
 * - Production with S3_PUBLIC_BASE_URL: redirect to static HTML in storage
 * - Development without S3_PUBLIC_BASE_URL: fallback to server render (DB)
 * 
 * The CDN should be configured to rewrite /u/{slug} → pages/{slug}/index.html
 * This Next.js route is a fallback for development or CDN miss.
 * 
 * IMPORTANT: This route checks ONLY S3_PUBLIC_BASE_URL (public config).
 * It does NOT require S3_SECRET_ACCESS_KEY or other upload credentials.
 */

import { GetServerSideProps } from 'next';

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
  
  // Normalize slug to lowercase
  const normalizedSlug = slug.toLowerCase();
  
  // Validate slug format early - reject invalid slugs with 404
  if (!isValidSlug(normalizedSlug)) {
    return { notFound: true };
  }
  
  // Production behavior: ALWAYS redirect to storage if public URL is configured
  // No DB access, no fallback - this is the production contract
  if (isPublicPagesConfigured()) {
    const storageUrl = getStorageUrl(normalizedSlug);
    if (storageUrl) {
      return {
        redirect: {
          destination: storageUrl,
          // Use 307 (temporary) so updates propagate with cache purges
          // Do NOT use 301/308 permanent redirects
          permanent: false,
        },
      };
    }
  }
  
  // Development fallback ONLY: check if page exists in DB and render inline
  // This is STRICTLY gated to development mode
  if (process.env.NODE_ENV === 'development') {
    try {
      const db = await import('@/server/db');
      const page = await db.getPageBySlug(normalizedSlug);
      
      if (!page || !page.is_published) {
        return { notFound: true };
      }
      
      // In dev, we can do an inline render
      const { PageDocSchema } = await import('@/lib/schema/page');
      const { renderPageHtml } = await import('@/server/render/renderPageHtml');
      
      // Parse the stored doc
      let doc;
      try {
        const content = typeof page.content === 'string' 
          ? JSON.parse(page.content) 
          : page.content;
        const parsed = PageDocSchema.safeParse(content);
        if (parsed.success) {
          doc = parsed.data;
        } else {
          // Legacy format - try to convert
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
      
      // Render HTML
      const html = renderPageHtml(doc);
      
      // Send as raw HTML response
      context.res.setHeader('Content-Type', 'text/html; charset=utf-8');
      context.res.setHeader('Cache-Control', 'public, max-age=60');
      context.res.write(html);
      context.res.end();
      
      return { props: {} };
    } catch (error) {
      console.error('[/u/slug] Dev fallback error:', error);
      return { notFound: true };
    }
  }
  
  // Production without public pages configured: this is a configuration error
  // Log and return 404 - pages cannot be served without storage
  console.error('[/u/slug] S3_PUBLIC_BASE_URL not configured in production');
  return { notFound: true };
};
