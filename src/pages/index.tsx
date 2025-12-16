import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { routes } from '@/lib/routes';
import styles from '@/styles/Landing.module.css';

/**
 * / route - Redirects to edit page
 * 
 * Users are brought directly to the editor to start creating.
 * If ?fresh=1 is present, passes it along to create a fresh starter page.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check for fresh param to pass along
    const fresh = router.query.fresh === '1';
    router.replace(routes.edit(fresh ? { fresh: true } : undefined));
  }, [router]);

  // Show brief loading state during redirect
  return (
    <>
      <Head>
        <title>my corner of the internet</title>
        <meta name="description" content="Create your own corner of the internet. A simple, beautiful space that's entirely yours." />
      </Head>
      
      <main className={styles.main}>
        <div className={styles.content}>
          <span>Loading your space...</span>
        </div>
      </main>
    </>
  );
}
