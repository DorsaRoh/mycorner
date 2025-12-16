import { useState, useCallback, useEffect, useRef } from 'react';
import { getUsernameError } from '@/lib/routes';
import styles from './OnboardingModal.module.css';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (username: string) => void;
}

export function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Focus username input when modal opens
  useEffect(() => {
    if (isOpen && usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, [isOpen]);

  // Check username availability
  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameStatus('idle');
      setUsernameError(null);
      return;
    }

    // Validate format locally first
    const formatError = getUsernameError(value);
    if (formatError) {
      setUsernameStatus('invalid');
      setUsernameError(formatError);
      return;
    }

    setUsernameStatus('checking');
    setUsernameError(null);

    try {
      const res = await fetch(`/api/username/check?username=${encodeURIComponent(value)}`);
      const data = await res.json();
      
      if (data.available) {
        setUsernameStatus('available');
        setUsernameError(null);
      } else {
        setUsernameStatus('taken');
        setUsernameError(data.error || 'Username is taken');
      }
    } catch {
      setUsernameStatus('idle');
      setUsernameError('Could not check availability');
    }
  }, []);

  // Debounced username check
  const handleUsernameChange = useCallback((value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
    setUsername(clean);
    setSubmitError(null);

    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    if (clean.length >= 3) {
      setUsernameStatus('checking');
      checkTimeoutRef.current = setTimeout(() => {
        checkUsername(clean);
      }, 300);
    } else if (clean.length > 0) {
      setUsernameStatus('invalid');
      setUsernameError('Username must be at least 3 characters');
    } else {
      setUsernameStatus('idle');
      setUsernameError(null);
    }
  }, [checkUsername]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (usernameStatus !== 'available' || !username) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.toLowerCase(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Something went wrong');
        setSubmitting(false);
        return;
      }

      // Success - notify parent (parent handles publish + redirect)
      onComplete(data.user.username);
    } catch (err) {
      setSubmitError('Network error. Please try again.');
      setSubmitting(false);
    }
  }, [username, usernameStatus, onComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const canSubmit = usernameStatus === 'available' && !submitting;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Choose your username</h2>
          <p className={styles.subtitle}>
            This will be your public URL
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <div className={styles.inputWrapper}>
              <span className={styles.prefix}>@</span>
              <input
                ref={usernameInputRef}
                id="username"
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="yourname"
                className={`${styles.input} ${styles.inputWithPrefix}`}
                disabled={submitting}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck="false"
                maxLength={20}
              />
              <span className={styles.statusIcon}>
                {usernameStatus === 'checking' && <span className={styles.spinner} />}
                {usernameStatus === 'available' && <span className={styles.checkmark}>✓</span>}
                {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <span className={styles.cross}>✗</span>}
              </span>
            </div>
            {usernameError && <p className={styles.fieldError}>{usernameError}</p>}
            {usernameStatus === 'available' && (
              <p className={styles.fieldSuccess}>Available!</p>
            )}
            <p className={styles.hint}>
              <strong>mycorner.app/{username || '...'}</strong>
            </p>
          </div>

          {submitError && (
            <p className={styles.submitError}>{submitError}</p>
          )}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!canSubmit}
          >
            {submitting ? 'Saving...' : 'Continue'}
          </button>
        </form>

        <p className={styles.footerHint}>
          You can&apos;t change this later, so choose wisely!
        </p>
      </div>
    </div>
  );
}
