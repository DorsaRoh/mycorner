/**
 * /u/[slug] - legacy route, redirects to canonical /{slug}
 * 
 * this route exists for backwards compatibility.
 * all public pages are now served at /{slug}.
 */

import type { GetServerSideProps } from 'next';

export default function LegacyPublicPageRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug } = context.params as { slug: string };
  
  // permanent redirect to canonical route
  return {
    redirect: {
      destination: `/${slug.toLowerCase()}`,
      permanent: true,
    },
  };
};
