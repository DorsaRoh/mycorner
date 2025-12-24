/**
 * / route - Smart redirect
 * 
 * ROUTING MODEL:
 * - Logged in → redirect to /edit
 * - Logged out → redirect to /new
 * 
 * This is a server-side redirect to avoid flicker.
 * No landing page is rendered.
 */

import type { GetServerSideProps } from 'next';
import { getUserIdFromCookies } from '@/server/auth/session';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const cookieHeader = context.req.headers.cookie;
  
  // Check if user is authenticated
  const userId = await getUserIdFromCookies(cookieHeader);
  
  if (userId) {
    // Logged in → redirect to /edit
    return {
      redirect: {
        destination: '/edit',
        permanent: false,
      },
    };
  }
  
  // Logged out → redirect to /new
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
