/**
 * / route - Landing page
 * 
 * Simple landing with CTA → /new (anonymous editor)
 * No auth check needed - /new handles auth when publishing.
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '@/styles/Landing.module.css';

export default function Home() {
  const router = useRouter();

  const handleCTAClick = () => {
    // Always go to /new - it's an anonymous editor
    // Auth is only required when publishing
    router.push('/new');
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
          
          <button className={styles.cta} onClick={handleCTAClick}>
            make your own corner
          </button>
          
          <p className={styles.hint}>
            free • no ads • takes 2 minutes
          </p>
        </div>
      </main>
    </>
  );
}
