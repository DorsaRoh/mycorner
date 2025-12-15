import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { generateDraftId, setActiveDraftId } from '@/lib/draft/storage';
import { routes } from '@/lib/routes';

/**
 * / route - Immediately opens an editable canvas.
 * 
 * This is the core experience: immediate ownership.
 * No marketing page, no friction - just your corner of the internet.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Generate a new draft ID
    const draftId = generateDraftId();
    
    // Set as active draft
    setActiveDraftId(draftId);
    
    // Redirect to editor with the new draft ID
    router.replace(routes.edit(draftId));
  }, [router]);

  // Minimal loading state while redirecting
  return (
    <>
      <Head>
        <title>my corner</title>
        <meta name="description" content="Your corner of the internet" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        background: 'var(--color-bg)',
      }} />
    </>
  );
}
