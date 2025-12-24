/**
 * /new - Fresh starting page for new users
 * 
 * SIMPLE MODEL:
 * - Renders the Editor directly with localStorage draft (no database)
 * - User edits locally, nothing is saved to server
 * - When they publish: login → username → publish
 * - That's it. No cookies, no tokens, no complexity.
 * 
 * ?fresh=1 query param: Clears localStorage draft before rendering
 * (used after logout to ensure clean slate)
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Editor } from '@/components/editor/Editor';
import { clearDraft } from '@/lib/draft';

export default function NewPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  
  // Handle ?fresh=1 to clear all state
  useEffect(() => {
    const { fresh, publish } = router.query;
    
    // If fresh=1, clear the draft
    if (fresh === '1') {
      console.log('[/new] Fresh start - clearing draft');
      clearDraft();
      
      // Clean up URL (remove fresh param, keep publish if present)
      const newQuery = publish ? `?publish=1` : '';
      window.history.replaceState({}, '', `/new${newQuery}`);
    }
    
    setReady(true);
  }, [router.query]);
  
  // Show loading while handling fresh param
  if (!ready) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p>Loading...</p>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>My Corner</title>
      </Head>
      <Editor
        pageId="draft"
        mode="draft"
      />
    </>
  );
}
