import { useState, useCallback, useEffect } from 'react';
import styles from './FeedbackModal.module.css';

interface FeedbackModalProps {
  pageId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ pageId, isOpen, onClose }: FeedbackModalProps) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;

    setStatus('sending');
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          message: message.trim(),
          email: email.trim() || null,
        }),
      });

      const data = await response.json();

      if (data?.success) {
        setStatus('sent');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [pageId, message, email]);

  const handleClose = useCallback(() => {
    // Reset form when closing
    setMessage('');
    setEmail('');
    setStatus('idle');
    onClose();
  }, [onClose]);

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

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {status === 'sent' ? (
          <div className={styles.success}>
            <div className={styles.checkmark}>✓</div>
            <h2>Thanks for your feedback!</h2>
            <p>Your message has been sent to the page creator.</p>
            <button className={styles.doneBtn} onClick={handleClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <h2>Send feedback</h2>
            <p className={styles.subtitle}>
              Let the creator know what you think about this page.
            </p>

            <form onSubmit={handleSubmit}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your message..."
                className={styles.messageInput}
                rows={4}
                autoFocus
                required
              />

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email (optional)"
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
  );
}
