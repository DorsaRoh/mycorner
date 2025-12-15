import type { GetServerSideProps } from 'next';

/**
 * / route - Immediately redirects to a new draft.
 * 
 * This is the core experience: immediate ownership.
 * No marketing page, no friction - just your corner of the internet.
 */
export default function Home() {
  // This should never render - we always redirect server-side
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  // Generate a new draft ID server-side
  const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  
  return {
    redirect: {
      destination: `/edit/${draftId}`,
      permanent: false,
    },
  };
};
