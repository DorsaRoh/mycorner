import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';
import styles from '@/styles/Landing.module.css';

/**
 * / route - Landing page
 * 
 * Simple, inviting landing with one clear CTA to start creating.
 */
export default function Home() {
  return (
    <>
      <Head>
        <title>my corner of the internet</title>
        <meta name="description" content="Create your own corner of the internet. A simple, beautiful space that's entirely yours." />
      </Head>
      
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.logoWrapper}>
            <Image 
              src="/logo.png" 
              alt="my corner" 
              width={48} 
              height={48} 
              className={styles.logo}
              priority
            />
          </div>
          
          <h1 className={styles.title}>
            your corner of the internet
          </h1>
          
          <p className={styles.subtitle}>
            A simple, beautiful space that&apos;s entirely yours.
            <br />
            No login needed to start.
          </p>
          
          <Link href="/edit" className={styles.cta}>
            Make your own corner
          </Link>
          
          <p className={styles.hint}>
            Free forever · No account required to create
          </p>
        </div>
        
        {/* Decorative background */}
        <div className={styles.bgGradient} aria-hidden="true" />
      </main>
    </>
  );
}
