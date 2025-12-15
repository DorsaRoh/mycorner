import { useState, useCallback, useEffect } from 'react';
import { useMutation } from '@apollo/client';
import { SEND_PRODUCT_FEEDBACK } from '@/lib/graphql/mutations';
import styles from './FeedbackModal.module.css';

interface ProductFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProductFeedbackModal({ isOpen, onClose }: ProductFeedbackModalProps) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const [sendProductFeedback] = useMutation(SEND_PRODUCT_FEEDBACK);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) return;

    setStatus('sending');
    try {
      const { data } = await sendProductFeedback({
        variables: {
          message: message.trim(),
          email: email.trim() || null,
        },
      });

      if (data?.sendProductFeedback?.success) {
        setStatus('sent');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [message, email, sendProductFeedback]);

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
            <p>Your thoughts help us improve my corner.</p>
            <button className={styles.doneBtn} onClick={handleClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <h2>Share your thoughts</h2>
            <p className={styles.subtitle}>
              What do you wish to see or add? We'd love to hear your ideas.
            </p>

            <form onSubmit={handleSubmit}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your thoughts, ideas, or suggestions..."
                className={styles.messageInput}
                rows={5}
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
