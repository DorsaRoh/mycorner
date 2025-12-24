/**
 * UiButton - Platform UI button component
 * 
 * Adaptive button that uses platform UI tokens for consistent
 * appearance across all background types.
 */

import { forwardRef } from 'react';
import styles from './Platform.module.css';

export interface UiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

/**
 * Primary platform button with automatic contrast adaptation.
 */
export const UiButton = forwardRef<HTMLButtonElement, UiButtonProps>(
  function UiButton({ variant = 'secondary', size = 'md', className, children, ...props }, ref) {
    const variantClass = styles[`btn${variant.charAt(0).toUpperCase()}${variant.slice(1)}`];
    const sizeClass = styles[`btn${size.charAt(0).toUpperCase()}${size.slice(1)}`];
    
    return (
      <button
        ref={ref}
        className={`${styles.btn} ${variantClass} ${sizeClass} ${className || ''}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

export interface UiIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  label: string;
  children: React.ReactNode;
}

/**
 * Icon-only button with accessible label.
 */
export const UiIconButton = forwardRef<HTMLButtonElement, UiIconButtonProps>(
  function UiIconButton({ size = 'md', label, className, children, ...props }, ref) {
    const sizeClass = styles[`iconBtn${size.charAt(0).toUpperCase()}${size.slice(1)}`];
    
    return (
      <button
        ref={ref}
        className={`${styles.iconBtn} ${sizeClass} ${className || ''}`}
        aria-label={label}
        title={label}
        {...props}
      >
        {children}
      </button>
    );
  }
);

