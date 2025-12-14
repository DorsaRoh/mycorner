import { useCallback } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useRouter } from 'next/router';
import styles from './ExploreDrawer.module.css';

const GET_PUBLIC_PAGES = gql`
  query GetPublicPages($limit: Int) {
    publicPages(limit: $limit) {
      id
      title
      owner {
        displayName
      }
    }
  }
`;

interface PublicPage {
  id: string;
  title?: string;
  owner?: {
    displayName?: string;
  };
}

interface ExploreDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExploreDrawer({ isOpen, onClose }: ExploreDrawerProps) {
  const router = useRouter();
  
  const { data, loading } = useQuery<{ publicPages: PublicPage[] }>(GET_PUBLIC_PAGES, {
    variables: { limit: 12 },
    skip: !isOpen,
    fetchPolicy: 'cache-and-network',
  });

  const pages = data?.publicPages || [];

  const handleStumble = useCallback(() => {
    if (pages.length === 0) return;
    const randomPage = pages[Math.floor(Math.random() * pages.length)];
    router.push(`/p/${randomPage.id}`);
    onClose();
  }, [pages, router, onClose]);

  const handlePageClick = useCallback((pageId: string) => {
    router.push(`/p/${pageId}`);
    onClose();
  }, [router, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.drawer}>
        <header className={styles.header}>
          <h2 className={styles.title}>Explore</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className={styles.content}>
          {/* Stumble button */}
          <button 
            className={styles.stumbleBtn} 
            onClick={handleStumble}
            disabled={pages.length === 0}
          >
            <span className={styles.stumbleIcon}>✦</span>
            Stumble
          </button>

          {/* Section title */}
          <div className={styles.sectionTitle}>Recent spaces</div>

          {/* Loading state */}
          {loading && pages.length === 0 && (
            <div className={styles.loading}>Loading...</div>
          )}

          {/* Empty state */}
          {!loading && pages.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>No spaces yet</div>
              <div className={styles.emptyText}>
                Be the first to share your corner of the internet.
              </div>
            </div>
          )}

          {/* Pages grid */}
          {pages.length > 0 && (
            <div className={styles.pagesGrid}>
              {pages.map((page) => (
                <div
                  key={page.id}
                  className={styles.pageCard}
                  onClick={() => handlePageClick(page.id)}
                >
                  <div className={styles.thumbnail}>◇</div>
                  <div className={styles.pageInfo}>
                    <div className={styles.pageTitle}>
                      {page.title || 'Untitled'}
                    </div>
                    {page.owner?.displayName && (
                      <div className={styles.pageAuthor}>
                        by {page.owner.displayName}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
