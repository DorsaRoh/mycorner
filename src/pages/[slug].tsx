/**
 * /[slug] - Canonical public page route
 * 
 * Serves published pages using Server-Side Rendering (SSR) from the database.
 * The canonical URL is always https://www.itsmycorner.com/{slug}.
 * 
 * ARCHITECTURE DECISION - WHY SSR (getServerSideProps) NOT SSG:
 * 
 * We use getServerSideProps instead of getStaticPaths + getStaticProps because:
 * 
 * 1. NO "LOADING..." BUG: Static generation with fallback: true/blocking causes
 *    the page to show "Loading..." during the initial build, which can get stuck
 *    if the fetch fails or takes too long. SSR always renders on request.
 * 
 * 2. DB IS SOURCE OF TRUTH: The published page content lives in the database
 *    (published_content column). SSR fetches directly from DB, ensuring the
 *    latest published version is always served.
 * 
 * 3. CONSISTENT RENDERING: We use the same React components (ViewerCanvas,
 *    ViewerBlock) as the editor preview, ensuring perfect visual parity.
 * 
 * 4. NO R2 DEPENDENCY FOR SERVING: R2 storage is optional for caching/CDN
 *    purposes, but the app can serve pages without it. This prevents the
 *    "blank page" issue when R2 HTML is incomplete or missing Next.js assets.
 * 
 * 5. SIMPLER DEBUGGING: One code path, one rendering method, one source of truth.
 * 
 * CACHING:
 * - We set Cache-Control headers for edge caching (s-maxage)
 * - CDN cache is purged on publish via Cloudflare API
 * - This gives us SSR benefits with CDN-level performance
 */

import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { RESERVED_PATHS } from '@/lib/routes';
import { PageDocSchema, convertLegacyPage } from '@/lib/schema/page';
import type { PageDoc } from '@/lib/schema/page';
import { PublicPageView } from '@/components/viewer/PublicPageView';

// =============================================================================
// Types
// =============================================================================

interface PageProps {
  doc: PageDoc;
  slug: string;
}

// =============================================================================
// Page Component
// =============================================================================

export default function PublicPage({ 
  doc, 
  slug 
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // Render using React components - same as editor preview
  return <PublicPageView doc={doc} slug={slug} />;
}

// =============================================================================
// Server-Side Props - Fetch from Database
// =============================================================================

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {
  const { slug: rawSlug } = context.params as { slug: string };
  const { res } = context;
  
  // Normalize slug to lowercase
  const slug = rawSlug.toLowerCase();
  
  // Skip reserved paths - let Next.js handle them with 404
  if (RESERVED_PATHS.has(slug)) {
    return { notFound: true };
  }
  
  // Validate slug format (basic check)
  if (!/^[a-z0-9_-]{1,64}$/.test(slug)) {
    return { notFound: true };
  }
  
  try {
    // Import database module (lazy import for serverless)
    const db = await import('@/server/db');
    
    // Try to find page by slug
    let page = await db.getPageBySlug(slug);
    
    // If not found by slug, try as username
    if (!page) {
      const user = await db.getUserByUsername(slug);
      if (user) {
        const pages = await db.getPagesByUserId(user.id);
        // Get the published page for this user
        page = pages.find(p => p.is_published) || null;
      }
    }
    
    // Page not found or not published
    if (!page || !page.is_published) {
      return { notFound: true };
    }
    
    // Parse the published content
    let doc: PageDoc;
    try {
      // Use published_content if available, otherwise fall back to content
      const rawContent = page.published_content || page.content;
      const content = typeof rawContent === 'string' 
        ? JSON.parse(rawContent) 
        : rawContent;
      
      // Try to parse as PageDoc (new format)
      const parsed = PageDocSchema.safeParse(content);
      if (parsed.success) {
        doc = parsed.data;
      } else {
        // Legacy format - convert blocks array to PageDoc
        const blocks = Array.isArray(content) ? content : [];
        const background = page.published_background 
          ? (typeof page.published_background === 'string' 
              ? JSON.parse(page.published_background) 
              : page.published_background)
          : (page.background 
              ? (typeof page.background === 'string' 
                  ? JSON.parse(page.background) 
                  : page.background)
              : undefined);
        
        doc = convertLegacyPage({ 
          title: page.title || undefined, 
          blocks,
          background,
        });
      }
    } catch (parseError) {
      console.error('[/slug] Failed to parse page content:', parseError);
      return { notFound: true };
    }
    
    // Set cache headers for CDN
    // - s-maxage: CDN caches for 1 minute
    // - stale-while-revalidate: Serve stale while fetching fresh (1 day)
    // CDN cache is purged on publish, so this is safe
    res.setHeader(
      'Cache-Control', 
      'public, s-maxage=60, stale-while-revalidate=86400'
    );
    
    // Return props for React rendering
    return {
      props: {
        doc,
        slug,
      },
    };
    
  } catch (error) {
    console.error('[/slug] Error fetching page from database:', error);
    
    // Return 500 error page
    // In production, you might want to show a custom error page
    throw error;
  }
};
