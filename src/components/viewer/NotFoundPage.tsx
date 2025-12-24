/**
 * NotFoundPage - 404 UI for public pages that don't exist or aren't published.
 * 
 * This provides a user-friendly message instead of a blank page.
 * Includes a CTA to create their own corner.
 * 
 * IMPORTANT: The "Create your own corner" CTA goes directly to /new?fresh=1
 * which creates a fresh anonymous page. We use ?fresh=1 to ensure:
 * - Existing session cookies are ignored
 * - A brand new draft token is generated
 * - User gets a clean starter layout
 */

import Head from 'next/head';

interface NotFoundPageProps {
  slug: string;
  message?: string;
}

export function NotFoundPage({ slug, message }: NotFoundPageProps) {
  // Navigate directly to /new?fresh=1 for a completely fresh start
  // This ensures we ignore any existing session and create a new anonymous page
  const handleCreateCorner = () => {
    window.location.href = '/new?fresh=1';
  };
  
  // Navigate to /new?fresh=1 instead of homepage to avoid returning to old session
  const handleGoHome = () => {
    window.location.href = '/new?fresh=1';
  };

  return (
    <>
      <Head>
        <title>Page Not Found | My Corner</title>
        <meta name="robots" content="noindex" />
      </Head>
      
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
        color: '#333',
      }}>
        {/* Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)',
        }}>
          <span style={{ fontSize: '40px' }}>🏠</span>
        </div>
        
        {/* Title */}
        <h1 style={{
          fontSize: '28px',
          fontWeight: 600,
          margin: '0 0 8px 0',
          textAlign: 'center',
        }}>
          This corner doesn&apos;t exist yet
        </h1>
        
        {/* Subtitle */}
        <p style={{
          fontSize: '16px',
          color: '#666',
          margin: '0 0 32px 0',
          textAlign: 'center',
          maxWidth: '400px',
        }}>
          {message || <>The page <strong>/{slug}</strong> hasn&apos;t been created or isn&apos;t published yet.</>}
        </p>
        
        {/* CTA - Goes through logout to ensure fresh start (no auto-login) */}
        {/* Using button with window.location because API routes need full page navigation */}
        <button 
          onClick={handleCreateCorner}
          style={{
            padding: '12px 28px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            fontSize: '16px',
            fontWeight: 500,
            borderRadius: '8px',
            boxShadow: '0 2px 12px rgba(102, 126, 234, 0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer',
          }}
        >
          Create your own corner
        </button>
        
        {/* Secondary link - also goes to fresh start to avoid stale session */}
        <button 
          onClick={handleGoHome}
          style={{
            marginTop: '16px',
            fontSize: '14px',
            color: '#666',
            textDecoration: 'none',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
          }}
        >
          ← Start fresh
        </button>
        
        {/* Dev debug info */}
        {process.env.NODE_ENV !== 'production' && (
          <div style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.8)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: '10px',
            borderRadius: '4px',
          }}>
            <div>Slug: {slug}</div>
            <div>Status: 404 (not found or not published)</div>
          </div>
        )}
      </div>
    </>
  );
}

