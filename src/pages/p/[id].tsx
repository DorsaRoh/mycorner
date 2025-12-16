import type { GetServerSideProps } from 'next';
import { initializeApollo } from '@/lib/apollo/client';
import { GET_PUBLIC_PAGE } from '@/lib/graphql/mutations';
import { routes } from '@/lib/routes';

/**
 * /p/[id] - Legacy route, redirects to /{username}
 * 
 * This page exists for backward compatibility with old links.
 * All public pages now use the canonical /{username} route.
 */
export default function ViewPageLegacy() {
  // This should never render - we redirect server-side
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { id } = context.params as { id: string };
  
  const apolloClient = initializeApollo();

  try {
    const { data } = await apolloClient.query({
      query: GET_PUBLIC_PAGE,
      variables: { id },
      fetchPolicy: 'network-only',
    });

    const page = data.publicPage || data.page;
    
    // If page exists and owner has a username, redirect to canonical URL
    if (page?.owner?.username) {
      return {
        redirect: {
          destination: routes.user(page.owner.username),
          permanent: true, // 308 redirect
        },
      };
    }

    // Page doesn't exist or owner has no username - show 404
    return { notFound: true };
  } catch (error) {
    console.error('Failed to fetch page for redirect:', error);
    return { notFound: true };
  }
};
