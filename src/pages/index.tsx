import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, gql } from '@apollo/client';
import Head from 'next/head';
import { routes } from '@/lib/routes';
import { AuthGate } from '@/components/editor/AuthGate';
import styles from '@/styles/Landing.module.css';

const ME_QUERY = gql`
  query Me {
    me {
      id
      username
    }
  }
`;

/**
 * / route - Landing page with CTA
 * 
 * CTA behavior:
 * - If authenticated → go to /edit
 * - If not authenticated → show auth modal, then go to /edit after sign-in
 */
export default function Home() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { data: meData, loading: meLoading } = useQuery(ME_QUERY, {
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    if (!meLoading) {
      setIsCheckingAuth(false);
    }
  }, [meLoading]);

  const handleCTAClick = () => {
    const isAuthenticated = !!meData?.me;
    
    if (isAuthenticated) {
      // Already authenticated - go directly to /edit
      router.push(routes.edit());
    } else {
      // Not authenticated - show auth modal
      setShowAuthModal(true);
    }
  };

  return (
    <>
      <Head>
        <title>my corner of the internet</title>
        <meta name="description" content="Create your own corner of the internet. A simple, beautiful space that's entirely yours." />
      </Head>
      
      <main className={styles.main}>
        <div className={styles.bgGradient} />
        <div className={styles.content}>
          <h1 className={styles.title}>your corner of the internet</h1>
          <p className={styles.subtitle}>
            A simple, beautiful space that&apos;s entirely yours. Share what matters to you.
          </p>
          
          <button
            className={styles.cta}
            onClick={handleCTAClick}
            disabled={isCheckingAuth}
          >
            {isCheckingAuth ? 'Loading...' : 'make your own corner'}
          </button>
          
          <p className={styles.hint}>
            free • no ads • takes 2 minutes
          </p>
        </div>
      </main>

      <AuthGate
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Sign in to get started"
        subtitle="Create your corner of the internet. It's free, takes 2 minutes, and no ads."
      />
    </>
  );
}
