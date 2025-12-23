/**
 * /new - Anonymous editor page
 * 
 * VIRAL LOOP ENTRY POINT:
 * 1. User arrives (from CTA on another page or landing)
 * 2. Edits their corner locally (localStorage)
 * 3. Clicks Publish → triggers auth if needed
 * 4. After auth, immediately publishes (NO username step)
 * 5. Redirects to /u/[slug]
 * 
 * Draft storage: localStorage key 'yourcorner:draft:v1'
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Editor } from '@/components/editor/Editor';
import { AuthGate } from '@/components/editor/AuthGate';
import { OnboardingModal } from '@/components/editor/OnboardingModal';
import { clearDraft, migrateLegacyDraft, loadEditorDraft, getDraftAsPageDoc } from '@/lib/draft';
import { createStarterBlocks, DEFAULT_STARTER_BACKGROUND } from '@/lib/starter';
import styles from '@/styles/EditPage.module.css';

// =============================================================================
// Types
// =============================================================================

interface MeResponse {
  user: {
    id: string;
    email?: string;
    name?: string;
    username?: string;
  } | null;
}

interface OnboardingResponse {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    username: string;
  };
}

// =============================================================================
// Page Component
// =============================================================================

export default function NewPage() {
  const router = useRouter();
  const [draftId] = useState('draft-v1'); // Single draft ID
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [initialBlocks, setInitialBlocks] = useState<any[]>([]);
  const [initialTitle, setInitialTitle] = useState('');
  const [initialBackground, setInitialBackground] = useState(DEFAULT_STARTER_BACKGROUND);
  const [initialized, setInitialized] = useState(false);
  
  // Auth state
  const [meLoading, setMeLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<MeResponse['user']>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  
  // Fetch auth status
  const fetchMe = useCallback(async (): Promise<MeResponse> => {
    try {
      const response = await fetch('/api/me');
      const data = await response.json();
      return data;
    } catch {
      return { user: null };
    }
  }, []);
  
  // Initial auth check
  useEffect(() => {
    fetchMe().then((data) => {
      setIsAuthenticated(!!data.user);
      setCurrentUser(data.user);
      setNeedsUsername(!!data.user && !data.user.username);
      setMeLoading(false);
    });
  }, [fetchMe]);
  
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
      setInitialBackground(DEFAULT_STARTER_BACKGROUND);
    } else {
      // No draft, use starter blocks (default to desktop layout)
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      setInitialBlocks(createStarterBlocks(isMobile));
      setInitialTitle('');
      setInitialBackground(DEFAULT_STARTER_BACKGROUND);
    }
    
    setInitialized(true);
  }, [initialized]);
  
  // Handle publish flow
  const handlePublishFlow = useCallback(async () => {
    setPublishing(true);
    setPublishError(null);
    
    try {
      // Re-check auth
      const freshMe = await fetchMe();
      const authed = !!freshMe.user;
      
      if (!authed) {
        // Need auth first
        setShowAuthGate(true);
        setPublishing(false);
        return;
      }
      
      // Get current draft as PageDoc format
      const doc = getDraftAsPageDoc();
      if (!doc) {
        setPublishError('No draft found. Please add some content first.');
        setPublishing(false);
        return;
      }
      
      // Call new publish API
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        setPublishError(result.error || 'Failed to publish. Please try again.');
        setPublishing(false);
        return;
      }
      
      // Clear draft
      clearDraft();
      
      // Redirect to published page
      // If user has username, use that route (will redirect to /u/slug)
      // Otherwise use /u/slug directly
      if (currentUser?.username) {
        router.push(`/${currentUser.username}`);
      } else {
        router.push(`/u/${result.slug}`);
      }
      
    } catch (error) {
      console.error('Publish error:', error);
      setPublishError('Network error. Please try again.');
      setPublishing(false);
    }
  }, [fetchMe, router]);
  
  // Check for ?publish=1 query param (after auth redirect)
  useEffect(() => {
    if (!router.isReady || meLoading) return;
    
    const shouldPublish = router.query.publish === '1';
    if (shouldPublish && isAuthenticated) {
      // If user needs username, show onboarding modal first
      if (needsUsername) {
        setShowOnboarding(true);
        return;
      }
      
      // User has username, proceed with publish
      // Clear the query param
      router.replace('/new', undefined, { shallow: true });
      // Immediately publish
      handlePublishFlow();
    }
  }, [router.isReady, router.query.publish, isAuthenticated, needsUsername, meLoading, router, handlePublishFlow]);
  
  // Handle auth gate redirect - use API route
  const handleAuthStart = useCallback(() => {
    window.location.href = `/api/auth/google?returnTo=/new?publish=1`;
  }, []);
  
  // Handle onboarding completion
  const handleOnboardingComplete = useCallback(async (username: string) => {
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      
      const result: OnboardingResponse = await response.json();
      
      if (!response.ok || !result.success) {
        console.error('Onboarding failed:', result.error);
        return;
      }
      
      // Update user state
      setCurrentUser(prev => prev ? { ...prev, username } : null);
      setNeedsUsername(false);
      setShowOnboarding(false);
      
      // If we have ?publish=1, proceed with publish
      if (router.query.publish === '1') {
        // Clear the query param
        router.replace('/new', undefined, { shallow: true });
        // Immediately publish
        handlePublishFlow();
      }
    } catch (error) {
      console.error('Onboarding error:', error);
    }
  }, [router, handlePublishFlow]);
  
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
  
  // Publishing state
  if (publishing) {
    return (
      <>
        <Head>
          <title>Publishing... – YourCorner</title>
        </Head>
        <div className={styles.loading}>
          <span>Publishing your corner...</span>
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
      
      {publishError && (
        <div className={styles.errorToast}>
          {publishError}
          <button onClick={() => setPublishError(null)}>×</button>
        </div>
      )}
      
      <AuthGate
        isOpen={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        onAuthStart={handleAuthStart}
        title="Sign in to publish"
        subtitle="Create your corner of the internet. It's free and takes 2 minutes."
      />
      
      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
      />
    </>
  );
}
