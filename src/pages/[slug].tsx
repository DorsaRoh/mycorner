/**
 * /[slug] - Canonical public page route
 * 
 * Serves published pages using Incremental Static Regeneration (ISR).
 * The canonical URL is always https://www.itsmycorner.com/{slug}.
 * 
 * ARCHITECTURE DECISION - WHY ISR (getStaticProps):
 * 
 * 1. IMMEDIATE RENDERING: Pages are pre-rendered and served from CDN/cache.
 *    No "Loading..." states, no database query on every request.
 * 
 * 2. ON-DEMAND REVALIDATION: When a user publishes, we call revalidate()
 *    from the API route. This regenerates the page immediately.
 * 
 * 3. FALLBACK BLOCKING: New slugs are rendered on first request and
 *    then cached. Users never see a loading state.
 * 
 * 4. ANONYMOUS ACCESS: No authentication required. Anyone can view.
 * 
 * 5. NO CACHE BUSTERS: No ?_t= hacks. No replaceState cleanup.
 *    The ISR system handles freshness automatically.
 * 
 * CACHING STRATEGY:
 * - revalidate: 60 seconds (background revalidation for stale content)
 * - On publish: revalidate() is called immediately for fresh content
 */

import type { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from 'next';
import { RESERVED_PATHS } from '@/lib/routes';
import { getPublishedPageBySlug, isValidSlug } from '@/lib/pages';
import type { PageDoc } from '@/lib/schema/page';
import { PublicPageView } from '@/components/viewer/PublicPageView';
import { NotFoundPage } from '@/components/viewer/NotFoundPage';

// =============================================================================
// Types
// =============================================================================

interface PageProps {
  doc: PageDoc | null;
  slug: string;
  notFound?: boolean;
}

// =============================================================================
// Page Component
// =============================================================================

export default function PublicPage({ 
  doc, 
  slug,
  notFound,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  // Show 404 UI if page not found or not published
  if (notFound || !doc) {
    return <NotFoundPage slug={slug} />;
  }
  
  // Render the published page
  return <PublicPageView doc={doc} slug={slug} />;
}

// =============================================================================
// Static Paths - Pre-render nothing, use fallback for on-demand generation
// =============================================================================

export const getStaticPaths: GetStaticPaths = async () => {
  // We don't pre-render any pages at build time.
  // All pages are generated on-demand with fallback: 'blocking'.
  // This is ideal for user-generated content.
  return {
    paths: [],
    fallback: 'blocking',
  };
};

// =============================================================================
// Static Props - Fetch from Database with ISR
// =============================================================================

export const getStaticProps: GetStaticProps<PageProps> = async (context) => {
  const { slug: rawSlug } = context.params as { slug: string };
  
  // Normalize slug to lowercase
  const slug = rawSlug.toLowerCase();
  
  // Skip reserved paths - these should 404
  if (RESERVED_PATHS.has(slug)) {
    return {
      props: { doc: null, slug, notFound: true },
      revalidate: 60,
    };
  }
  
  // Validate slug format
  if (!isValidSlug(slug)) {
    return {
      props: { doc: null, slug, notFound: true },
      revalidate: 60,
    };
  }
  
  try {
    // Fetch published page data
    const pageData = await getPublishedPageBySlug(slug);
    
    if (!pageData) {
      // Page not found or not published
      // Return with revalidate so if user publishes, it will update
      if (process.env.NODE_ENV === 'development') {
        console.log(`[/slug] getStaticProps: Not found - ${slug}`);
      }
      
      return {
        props: { doc: null, slug, notFound: true },
        revalidate: 60, // Check again in 60 seconds
      };
    }
    
    // Success - return the page data
    if (process.env.NODE_ENV === 'development') {
      console.log(`[/slug] getStaticProps: Found - ${slug}, blocks: ${pageData.doc.blocks.length}`);
    }
    
    // Validate blocks before returning
    if (pageData.doc.blocks.length === 0) {
      console.warn(`[/slug] WARNING: Page ${slug} has 0 blocks`);
    }
    
    return {
      props: {
        doc: pageData.doc,
        slug,
      },
      // ISR: Revalidate every 60 seconds in the background
      // On-demand revalidation is triggered by /api/publish
      revalidate: 60,
    };
    
  } catch (error) {
    console.error(`[/slug] Error fetching page ${slug}:`, error);
    
    // Return 404-like page on error, with revalidation
    return {
      props: { doc: null, slug, notFound: true },
      revalidate: 10, // Retry sooner on error
    };
  }
};
