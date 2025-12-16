import type { GetServerSideProps } from 'next';
import { routes } from '@/lib/routes';

/**
 * /edit/[id] - Legacy route, redirects to /edit
 * 
 * This page exists for backward compatibility with bookmarks and browser history.
 * All edit functionality now lives at /edit (canonical route).
 */
export default function EditPageLegacy() {
  // This should never render - we redirect server-side
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  // Always redirect to canonical /edit route
  return {
    redirect: {
      destination: routes.edit(),
      permanent: true, // 308 redirect - browsers will update bookmarks
    },
  };
};
