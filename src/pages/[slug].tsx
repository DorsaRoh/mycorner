/**
 * /[slug] - canonical public page route
 * 
 * serves published pages by fetching static HTML from R2 and streaming it
 * to the client. the canonical URL is always https://www.itsmycorner.com/{slug}.
 * 
 * architecture:
 * - HTML is stored in R2 at pages/{slug}/index.html
 * - this route fetches from R2 server-side and serves the HTML directly
 * - no redirect to R2 URLs - the app domain is canonical
 * - R2 is just storage, not the serving domain
 * 
 * behavior:
 * - found: serve HTML with cache headers
 * - not found: return 404
 * - storage error: return 500
 */

import type { GetServerSideProps } from 'next';
import { RESERVED_PATHS } from '@/lib/routes';
import { getPageHtml, isValidSlug, isUploadConfigured } from '@/server/storage/client';

// =============================================================================
// page component (should not render - we send raw HTML)
// =============================================================================

export default function PublicPage() {
  // this should never render - getServerSideProps sends raw HTML
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <p>Loading...</p>
    </div>
  );
}

// =============================================================================
// server-side props - fetch and serve HTML from R2
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug: rawSlug } = context.params as { slug: string };
  const { res } = context;
  
  // normalize slug to lowercase
  const slug = rawSlug.toLowerCase();
  
  // skip reserved paths - let Next.js handle them
  if (RESERVED_PATHS.has(slug)) {
    return { notFound: true };
  }
  
  // validate slug format
  if (!isValidSlug(slug)) {
    return { notFound: true };
  }
  
  // check if storage is configured
  if (!isUploadConfigured()) {
    // in development without storage, try DB fallback
    if (process.env.NODE_ENV !== 'production') {
      return await devFallback(slug, context);
    }
    
    console.error('[/slug] storage not configured in production');
    return { notFound: true };
  }
  
  try {
    // fetch HTML from R2
    const html = await getPageHtml(slug);
    
    if (!html) {
      // page not found in storage
      return { notFound: true };
    }
    
    // set response headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // send HTML and end response
    res.statusCode = 200;
    res.end(html);
    
    // return empty props (response already sent)
    return { props: {} };
    
  } catch (error) {
    console.error('[/slug] error fetching from storage:', error);
    
    // return 500 for storage errors
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!DOCTYPE html><html><head><title>Error</title></head><body><h1>500 - Server Error</h1><p>Unable to load page. Please try again later.</p></body></html>');
    
    return { props: {} };
  }
};

// =============================================================================
// development fallback - render from database when storage not configured
// =============================================================================

async function devFallback(
  slug: string,
  context: Parameters<GetServerSideProps>[0]
): Promise<ReturnType<GetServerSideProps>> {
  try {
    const db = await import('@/server/db');
    
    // first try to get page by slug
    let page = await db.getPageBySlug(slug);
    
    // if not found by slug, try as username
    if (!page) {
      const user = await db.getUserByUsername(slug);
      if (user) {
        const pages = await db.getPagesByUserId(user.id);
        page = pages.find(p => p.is_published) || null;
      }
    }
    
    if (!page || !page.is_published) {
      return { notFound: true };
    }
    
    // parse and render
    const { PageDocSchema, convertLegacyPage } = await import('@/lib/schema/page');
    const { renderPageHtml } = await import('@/server/render/renderPageHtml');
    
    let doc;
    try {
      const content = typeof page.content === 'string' 
        ? JSON.parse(page.content) 
        : page.content;
      const parsed = PageDocSchema.safeParse(content);
      if (parsed.success) {
        doc = parsed.data;
      } else {
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
    
    const html = renderPageHtml(doc);
    
    context.res.setHeader('Content-Type', 'text/html; charset=utf-8');
    context.res.setHeader('Cache-Control', 'public, max-age=60');
    context.res.write(html);
    context.res.end();
    
    return { props: {} };
  } catch (error) {
    console.error('[/slug] dev fallback error:', error);
    return { notFound: true };
  }
}

