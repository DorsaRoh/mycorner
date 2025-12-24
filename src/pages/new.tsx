/**
 * /new - Fresh starting page for new users
 * 
 * EPHEMERAL MODEL:
 * - ALWAYS shows a fresh default page on load/refresh
 * - Changes exist only in memory (not saved to localStorage or DB)
 * - When they publish: login → username → create page in DB
 * - Refresh = lose changes (intentional - encourages publishing)
 * 
 * This creates urgency: "publish to save your work!"
 */

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Editor } from '@/components/editor/Editor';
import { clearDraft } from '@/lib/draft';

export default function NewPage() {
  const [ready, setReady] = useState(false);
  
  // ALWAYS clear draft on mount - /new is always a fresh start
  useEffect(() => {
    console.log('[/new] Clearing draft - starting fresh');
    clearDraft();
    setReady(true);
  }, []);
  
  // Show loading while clearing draft
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
        ephemeral={true}
      />
    </>
  );
}
