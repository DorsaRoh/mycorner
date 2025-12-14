import { useState, useCallback, useEffect } from 'react';
import { useMutation, gql } from '@apollo/client';
import styles from './InviteModal.module.css';

const REQUEST_MAGIC_LINK = gql`
  mutation RequestMagicLink($email: String!) {
    requestMagicLink(email: $email) {
      success
      message
    }
  }
`;

interface InviteModalProps {
  pageId: string;
  isOpen: boolean;
  onClose: () => void;
  needsAuth?: boolean;
  publishError?: string | null;
}

export function InviteModal({ 
  pageId, 
  isOpen, 
  onClose, 
  needsAuth = false,
  publishError 
}: InviteModalProps) {
  const [copied, setCopied] = useState(false);
  const [showAuth, setShowAuth] = useState(needsAuth);
  const [email, setEmail] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const [requestMagicLink] = useMutation(REQUEST_MAGIC_LINK);

  const publicUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/p/${pageId}`
    : `/p/${pageId}`;

  // Reset auth state when modal opens with needsAuth
  useEffect(() => {
    if (isOpen) {
      setShowAuth(needsAuth);
      setAuthStatus('idle');
      setEmail('');
    }
  }, [isOpen, needsAuth]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = publicUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
    }
  }, [publicUrl]);

  // Reset copied state after delay
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleAuthSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setAuthStatus('sending');
    try {
      const { data } = await requestMagicLink({
        variables: { email: email.trim() },
      });
      if (data?.requestMagicLink?.success) {
        setAuthStatus('sent');
      } else {
        setAuthStatus('idle');
      }
    } catch {
      setAuthStatus('idle');
    }
  }, [email, requestMagicLink]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Auth gating modal - soft and calm
  if (showAuth) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          {authStatus === 'sent' ? (
            <>
              <div className={styles.header}>
                <h2 className={styles.title}>Check your email</h2>
              </div>
              <p className={styles.subtitle}>
                We sent a link to <strong>{email}</strong>
              </p>
              <p className={styles.hint}>
                Click the link to sign in, then you can invite others to your space.
              </p>
              <div className={styles.actions}>
                <button className={styles.doneBtn} onClick={onClose}>
                  Got it
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.header}>
                <div className={styles.icon}>🔑</div>
                <h2 className={styles.title}>Sign in to invite people in</h2>
              </div>
              <p className={styles.subtitle}>
                Your space will be shareable after you sign in.
              </p>
              <form onSubmit={handleAuthSubmit} className={styles.authForm}>
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
                  className={styles.continueBtn}
                  disabled={authStatus === 'sending' || !email.trim()}
                >
                  {authStatus === 'sending' ? 'Sending...' : 'Continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // Invite modal - calm and minimal
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Invite someone in</h2>
        </div>

        <p className={styles.subtitle}>Share your space with a link.</p>

        {/* Error message - calm, not harsh */}
        {publishError && (
          <p className={styles.errorText}>{publishError}</p>
        )}

        <div className={styles.urlBox}>
          <input
            type="text"
            value={publicUrl}
            readOnly
            className={styles.urlInput}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button 
            className={styles.copyBtn}
            onClick={handleCopy}
          >
            {copied ? <span className={styles.copiedText}>copied</span> : 'Copy link'}
          </button>
        </div>

        <div className={styles.actions}>
          <a 
            href={publicUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className={styles.viewLink}
          >
            View ↗
          </a>
          <button className={styles.doneBtn} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
