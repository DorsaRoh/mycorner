/**
 * /new - Anonymous editor page
 * 
 * VIRAL LOOP ENTRY POINT:
 * 1. User arrives (from CTA on another page or landing)
 * 2. Edits their corner locally (localStorage)
 * 3. Clicks Publish → Editor handles auth gate if needed
 * 4. After auth, Editor handles publish and shows confetti
 * 5. User stays on editor with published URL visible
 * 
 * Draft storage: localStorage key 'yourcorner:draft:v1'
 * 
 * Note: All publish/auth flow is handled by the Editor component.
 * This page just initializes the draft from localStorage and renders the Editor.
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Editor } from '@/components/editor/Editor';
import { migrateLegacyDraft, loadEditorDraft } from '@/lib/draft';
import { createStarterBlocks, DEFAULT_STARTER_BACKGROUND } from '@/lib/starter';
import type { BackgroundConfig } from '@/shared/types';
import styles from '@/styles/EditPage.module.css';

// =============================================================================
// Page Component
// =============================================================================

export default function NewPage() {
  const router = useRouter();
  const [draftId] = useState('draft-v1'); // Single draft ID
  const [initialBlocks, setInitialBlocks] = useState<any[]>([]);
  const [initialTitle, setInitialTitle] = useState('');
  const [initialBackground, setInitialBackground] = useState<BackgroundConfig>(DEFAULT_STARTER_BACKGROUND);
  const [initialized, setInitialized] = useState(false);
  
  // Migrate legacy drafts on first load
  const migrationDone = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (migrationDone.current) return;
    migrationDone.current = true;
    migrateLegacyDraft();
  }, []);
  
  // Initialize from draft storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initialized) return;
    
    const draft = loadEditorDraft();
    if (draft) {
      // Load from draft storage (already in legacy format for Editor)
      setInitialTitle(draft.title || '');
      setInitialBlocks(draft.blocks || []);
      // Use saved background or fall back to default
      setInitialBackground(draft.background || DEFAULT_STARTER_BACKGROUND);
    } else {
      // No draft, use starter blocks (default to desktop layout)
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      setInitialBlocks(createStarterBlocks(isMobile));
      setInitialTitle('');
      setInitialBackground(DEFAULT_STARTER_BACKGROUND);
    }
    
    setInitialized(true);
  }, [initialized]);
  
  // Clean up any error params from failed auth
  useEffect(() => {
    if (!router.isReady) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('error')) {
      urlParams.delete('error');
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [router.isReady]);
  
  // Loading state
  if (!initialized) {
    return (
      <>
        <Head>
          <title>Create your corner – YourCorner</title>
        </Head>
        <div className={styles.loading}>
          <span>Loading...</span>
        </div>
      </>
    );
  }
  
  return (
    <>
      <Head>
        <title>Create your corner – YourCorner</title>
        <meta name="description" content="Create your own corner of the internet. Free, no ads, takes 2 minutes." />
      </Head>
      
      <Editor
        pageId={draftId}
        mode="draft"
        initialBlocks={initialBlocks}
        initialTitle={initialTitle}
        initialBackground={initialBackground}
      />
    </>
  );
}
