import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { generateDraftId, setActiveDraftId } from '@/lib/draft/storage';
import { routes } from '@/lib/routes';

/**
 * /new route - Creates a new draft and redirects to the editor.
 * This page has no UI - it just generates an ID and redirects.
 */
export default function NewPage() {
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
        <title>Creating page... – my corner</title>
      </Head>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        color: 'var(--color-text-muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.875rem',
      }}>
        Creating your page...
      </div>
    </>
  );
}

