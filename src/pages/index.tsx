/**
 * / route - Simple redirect
 * 
 * SIMPLE MODEL:
 * - Logged in → redirect to /edit (their published page)
 * - Logged out → redirect to /new (fresh start)
 */

import type { GetServerSideProps } from 'next';
import { getUserIdFromCookies } from '@/server/auth/session';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const cookieHeader = context.req.headers.cookie;
  
  // Prevent caching
  context.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  // Check if user is authenticated
  const userId = await getUserIdFromCookies(cookieHeader);
  
  if (userId) {
    // Logged in → redirect to /edit (resolves to their page)
    return {
      redirect: {
        destination: '/edit',
        permanent: false,
      },
    };
  }
  
  // Logged out → redirect to /new (fresh start)
  return {
    redirect: {
      destination: '/new',
      permanent: false,
    },
  };
};

// This page should never render - it always redirects
export default function Home() {
  return null;
}
