import { useState, useCallback, useEffect } from 'react';
import styles from './PageCurl.module.css';

export function PageCurl() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;

    setStatus('sending');
    try {
      const response = await fetch('/api/feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          email: email.trim() || null,
          url: window.location.href,
        }),
      });

      if (response.ok) {
        setStatus('sent');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [message, email]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Reset after animation
    setTimeout(() => {
      setMessage('');
      setEmail('');
      setStatus('idle');
    }, 200);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleClose]);

  return (
    <>
      <button 
        className={styles.pageCurl}
        onClick={() => setIsOpen(true)}
        aria-label="Share feedback"
      >
        <span className={styles.curlText}>?</span>
      </button>

      {isOpen && (
        <div className={styles.overlay} onClick={handleClose}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {status === 'sent' ? (
              <div className={styles.success}>
                <div className={styles.checkmark}>✓</div>
                <h2>Thanks for sharing!</h2>
                <p>Your feedback helps us make my corner better.</p>
                <button className={styles.doneBtn} onClick={handleClose}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <h2>What would you like to see?</h2>
                <p className={styles.subtitle}>
                  Share a feature request, idea, or anything you&apos;d like changed.
                </p>

                <form onSubmit={handleSubmit}>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="I wish I could..."
                    className={styles.messageInput}
                    rows={4}
                    autoFocus
                    required
                  />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email (optional, for follow-up)"
                    className={styles.emailInput}
                  />

                  {status === 'error' && (
                    <p className={styles.error}>Something went wrong. Please try again.</p>
                  )}

                  <div className={styles.actions}>
                    <button 
                      type="button" 
                      className={styles.cancelBtn}
                      onClick={handleClose}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={styles.submitBtn}
                      disabled={status === 'sending' || !message.trim()}
                    >
                      {status === 'sending' ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
