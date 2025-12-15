import { useState, useCallback, useEffect, useRef } from 'react';
import styles from './OnboardingModal.module.css';

interface OnboardingModalProps {
  isOpen: boolean;
  userName?: string;
  onComplete: (username: string, pageTitle: string, pageId: string) => void;
  onClose?: () => void;
}

export function OnboardingModal({ isOpen, userName, onComplete, onClose }: OnboardingModalProps) {
  const [username, setUsername] = useState('');
  const [pageTitle, setPageTitle] = useState('my corner');
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

  // Generate suggested username from name
  useEffect(() => {
    if (userName && !username) {
      const suggested = userName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 15);
      if (suggested.length >= 3) {
        setUsername(suggested);
      }
    }
  }, [userName, username]);

  // Check username availability
  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameStatus('idle');
      setUsernameError(null);
      return;
    }

    // Validate format locally first
    const usernameRegex = /^[a-z0-9_]{3,20}$/;
    if (!usernameRegex.test(value)) {
      setUsernameStatus('invalid');
      setUsernameError('Use 3-20 lowercase letters, numbers, or underscores');
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
    const clean = value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
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
          pageTitle: pageTitle.trim() || 'my corner',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Something went wrong');
        setSubmitting(false);
        return;
      }

      // Success!
      onComplete(data.user.username, data.page.title, data.page.id);
    } catch (err) {
      setSubmitError('Network error. Please try again.');
      setSubmitting(false);
    }
  }, [username, pageTitle, usernameStatus, onComplete]);

  if (!isOpen) return null;

  const canSubmit = usernameStatus === 'available' && !submitting;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Welcome! Let&apos;s set up your corner</h2>
          <p className={styles.subtitle}>Choose a username and title for your page</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>
              Username
            </label>
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
              This will be your public URL: <strong>mycorner.app/u/{username || 'yourname'}</strong>
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor="pageTitle" className={styles.label}>
              Page Title
            </label>
            <input
              id="pageTitle"
              type="text"
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              placeholder="my corner"
              className={styles.input}
              disabled={submitting}
              maxLength={100}
            />
            <p className={styles.hint}>
              This appears at the top of your page
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
            {submitting ? 'Creating...' : 'Create my corner'}
          </button>
        </form>

        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} disabled={submitting}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
