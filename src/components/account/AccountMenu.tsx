import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from './AccountMenu.module.css';

interface AccountMenuProps {
  email: string;
  avatarUrl?: string | null;
  name?: string | null;
}

export function AccountMenu({ email, avatarUrl, name }: AccountMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Get initials from email or name for avatar fallback
  const initials = name
    ? name.charAt(0).toUpperCase()
    : email.charAt(0).toUpperCase();

  // Toggle menu
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close menu on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        // Redirect to /new after successful logout
        router.push('/new');
      } else {
        console.error('[AccountMenu] Logout failed');
        setIsLoggingOut(false);
      }
    } catch (error) {
      console.error('[AccountMenu] Logout error:', error);
      setIsLoggingOut(false);
    }
  }, [router, isLoggingOut]);

  // Handle keyboard navigation in menu
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  return (
    <div className={styles.container}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        data-testid="account-menu-trigger"
        title={email}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className={styles.avatar}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className={styles.avatarFallback}>{initials}</span>
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={styles.dropdown}
          role="menu"
          aria-label="Account menu"
        >
          <div className={styles.header}>
            <span className={styles.label}>Signed in as</span>
            <span className={styles.email} data-testid="account-menu-email" title={email}>
              {email}
            </span>
          </div>

          <div className={styles.divider} />

          <button
            className={styles.logoutBtn}
            onClick={handleLogout}
            disabled={isLoggingOut}
            role="menuitem"
            data-testid="account-menu-logout"
          >
            {isLoggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}

