import Head from 'next/head';
import Link from 'next/link';
import { routes } from '@/lib/routes';

export default function ServerError() {
  return (
    <>
      <Head>
        <title>500 - Server Error</title>
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
        <h1 style={{ fontSize: '4rem', margin: 0 }}>500</h1>
        <p style={{ color: '#888', marginTop: '1rem' }}>Something went wrong.</p>
        <Link 
          href={routes.home()} 
          style={{
            marginTop: '2rem',
            padding: '0.75rem 1.5rem',
            background: '#333',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '8px',
          }}
        >
          Go back home →
        </Link>
      </div>
    </>
  );
}

