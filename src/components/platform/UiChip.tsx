/**
 * UiChip - Platform UI chip/pill component
 * 
 * Used for floating action buttons, CTAs, and interactive chips
 * that need to remain visible on any background.
 */

import { forwardRef } from 'react';
import styles from './Platform.module.css';

export interface UiChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'accent';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Floating chip/pill button with glass effect.
 */
export const UiChip = forwardRef<HTMLButtonElement, UiChipProps>(
  function UiChip({ variant = 'default', size = 'md', icon, className, children, ...props }, ref) {
    const variantClass = variant === 'accent' ? styles.chipAccent : '';
    const sizeClass = size === 'sm' ? styles.chipSm : '';
    
    return (
      <button
        ref={ref}
        className={`${styles.chip} ${variantClass} ${sizeClass} ${className || ''}`}
        {...props}
      >
        {icon && <span className={styles.chipIcon}>{icon}</span>}
        {children}
      </button>
    );
  }
);

export interface UiChipLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: 'default' | 'accent';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Chip as a link element.
 */
export const UiChipLink = forwardRef<HTMLAnchorElement, UiChipLinkProps>(
  function UiChipLink({ variant = 'default', size = 'md', icon, className, children, ...props }, ref) {
    const variantClass = variant === 'accent' ? styles.chipAccent : '';
    const sizeClass = size === 'sm' ? styles.chipSm : '';
    
    return (
      <a
        ref={ref}
        className={`${styles.chip} ${variantClass} ${sizeClass} ${className || ''}`}
        {...props}
      >
        {icon && <span className={styles.chipIcon}>{icon}</span>}
        {children}
      </a>
    );
  }
);

