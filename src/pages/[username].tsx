/**
 * /[username] - Legacy route redirect
 * 
 * This route exists only for backward compatibility.
 * All public pages now live at /u/[slug].
 * 
 * Behavior:
 * - If slug exists and is published → redirect to /u/[slug]
 * - Otherwise → 404
 */

import type { GetServerSideProps } from 'next';
import { gql } from '@apollo/client';
import { initializeApollo } from '@/lib/apollo/client';

const CHECK_PAGE_EXISTS = gql`
  query CheckPageExists($username: String!) {
    pageByUsername(username: $username) {
      slug
      isPublished
    }
  }
`;

// Reserved paths that should NOT be treated as usernames
const RESERVED_PATHS = new Set([
  'edit', 'api', 'auth', 'graphql', 'health', '_next', 'static',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'p', 'u', 'onboarding',
  'admin', 'settings', 'login', 'logout', 'signup', 'register',
  'terms', 'privacy', 'about', 'help', 'support', 'blog', 'docs',
  'null', 'undefined', 'new', 'create', 'me', 'public', 'assets',
  'publish',
]);

export default function LegacyUserPage() {
  // This component should never render - we always redirect or 404
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { username } = context.params as { username: string };
  
  // Skip reserved paths - let Next.js handle them
  if (RESERVED_PATHS.has(username.toLowerCase())) {
    return { notFound: true };
  }
  
  const apolloClient = initializeApollo();

  try {
    const { data } = await apolloClient.query({
      query: CHECK_PAGE_EXISTS,
      variables: { username: username.toLowerCase() },
      fetchPolicy: 'network-only',
    });

    const page = data.pageByUsername;
    
    // If page exists and is published, redirect to canonical /u/[slug]
    if (page?.isPublished && page?.slug) {
      return {
        redirect: {
          destination: `/u/${page.slug}`,
          permanent: true, // 308 redirect
        },
      };
    }

    // Page doesn't exist or isn't published
    return { notFound: true };
  } catch (error) {
    console.error('Failed to check page:', error);
    return { notFound: true };
  }
};
