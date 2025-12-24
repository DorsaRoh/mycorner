import { useState, useCallback, useRef, useEffect } from 'react';
import { clearDraft } from '@/lib/draft/storage';
import { routes } from '@/lib/routes';
import styles from './AccountMenu.module.css';

interface AccountMenuProps {
  email: string;
  avatarUrl?: string | null;
  name?: string | null;
}

export function AccountMenu({ email, avatarUrl, name }: AccountMenuProps) {
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

    if (process.env.NODE_ENV === 'development') {
      console.log('[AccountMenu] Starting logout...');
    }

    try {
      // Call server logout endpoint to clear all auth cookies
      const response = await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include', // Ensure cookies are sent/received
      });
      
      if (!response.ok) {
        throw new Error(`Logout request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[AccountMenu] Server logout response:', data);
      }
      
      // Clear client-side draft storage to ensure fresh start
      clearDraft();
      
      // Clear any localStorage items that might cache user data
      if (typeof localStorage !== 'undefined') {
        // Clear any legacy draft keys and user-related data
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.startsWith('yourcorner:') || 
            key.startsWith('mycorner:') ||
            key.includes('draft') ||
            key.includes('user') ||
            key.includes('session') ||
            key.includes('auth')
          )) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[AccountMenu] Cleared localStorage keys:', keysToRemove);
        }
      }
      
      // Clear ALL sessionStorage to ensure completely fresh state
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
      
      const redirectUrl = routes.new({ fresh: true });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[AccountMenu] Logout successful, redirecting to', redirectUrl);
      }
      
      // Hard navigation to /new?fresh=1 to ensure completely fresh server state
      // Using window.location.replace to not keep logout in history
      window.location.replace(redirectUrl);
    } catch (error) {
      console.error('[AccountMenu] Logout error:', error);
      setIsLoggingOut(false);
      
      // Show user-facing error
      alert('Failed to log out. Please try again.');
    }
  }, [isLoggingOut]);

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

