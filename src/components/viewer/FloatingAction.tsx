import { useState } from 'react';
import styles from './FloatingAction.module.css';

interface FloatingActionProps {
  isOwner: boolean;
  isAuthenticated: boolean;
  onEdit: () => void;
  onFork: () => void;
  onRequestAuth: (email: string) => Promise<void>;
  forking: boolean;
}

export function FloatingAction({
  isOwner,
  isAuthenticated,
  onEdit,
  onFork,
  onRequestAuth,
  forking,
}: FloatingActionProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [email, setEmail] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleForkClick = () => {
    if (isAuthenticated) {
      onFork();
    } else {
      setShowAuthModal(true);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setAuthStatus('sending');
    try {
      await onRequestAuth(email.trim());
      setAuthStatus('sent');
    } catch {
      setAuthStatus('idle');
    }
  };

  if (isOwner) {
    return (
      <button className={styles.fab} onClick={onEdit}>
        Edit
      </button>
    );
  }

  return (
    <>
      <button 
        className={styles.fab} 
        onClick={handleForkClick}
        disabled={forking}
      >
        {forking ? 'Creating...' : 'Make your own'}
      </button>

      {showAuthModal && (
        <div className={styles.overlay} onClick={() => setShowAuthModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {authStatus === 'sent' ? (
              <>
                <h2>Check your email</h2>
                <p>We sent a login link to <strong>{email}</strong></p>
                <p className={styles.hint}>Click the link to sign in, then you can fork this page.</p>
                <button 
                  className={styles.closeBtn}
                  onClick={() => setShowAuthModal(false)}
                >
                  Got it
                </button>
              </>
            ) : (
              <>
                <h2>Sign in to continue</h2>
                <p>Enter your email to create your own version of this page.</p>
                <form onSubmit={handleAuthSubmit}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={styles.emailInput}
                    autoFocus
                    required
                  />
                  <button 
                    type="submit" 
                    className={styles.submitBtn}
                    disabled={authStatus === 'sending'}
                  >
                    {authStatus === 'sending' ? 'Sending...' : 'Send login link'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

