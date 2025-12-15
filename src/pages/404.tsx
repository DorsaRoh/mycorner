import Head from 'next/head';
import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <Head>
        <title>404 - Page Not Found</title>
      </Head>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#1a1a1a',
        color: '#fff',
      }}>
        <h1 style={{ fontSize: '4rem', margin: 0 }}>404</h1>
        <p style={{ color: '#888', marginTop: '1rem' }}>This page doesn&apos;t exist.</p>
        <Link 
          href="/" 
          style={{
            marginTop: '2rem',
            padding: '0.75rem 1.5rem',
            background: '#333',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '8px',
          }}
        >
          Create your corner →
        </Link>
      </div>
    </>
  );
}

