import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@apollo/client';
import { GET_MY_PAGE } from '@/lib/graphql/mutations';
import { getActiveDraftId, generateDraftId, setActiveDraftId } from '@/lib/draft/storage';
import styles from '@/styles/EditPage.module.css';

/**
 * /edit - Editor entrypoint
 * 
 * Resolves the user's editor destination:
 * 1. If authenticated with existing page → redirect to /edit/{pageId}
 * 2. If has active draft in localStorage → redirect to /edit/{draftId}
 * 3. Otherwise → create new draft and redirect
 */
export default function EditEntryPage() {
  const router = useRouter();
  
  // Check if user has an existing server page
  const { data, loading } = useQuery(GET_MY_PAGE, {
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    // Wait for query to complete
    if (loading) return;

    // Priority 1: User has an existing server page → load that
    if (data?.myPage?.id) {
      router.replace(`/edit/${data.myPage.id}`);
      return;
    }

    // Priority 2: User has an active draft → load that
    const activeDraft = getActiveDraftId();
    if (activeDraft) {
      router.replace(`/edit/${activeDraft}`);
      return;
    }

    // Priority 3: Create a new draft
    const newDraftId = generateDraftId();
    setActiveDraftId(newDraftId);
    router.replace(`/edit/${newDraftId}`);
  }, [data, loading, router]);

  // Show loading while resolving destination
  return (
    <div className={styles.loading}>
      <span>Loading your space...</span>
    </div>
  );
}

