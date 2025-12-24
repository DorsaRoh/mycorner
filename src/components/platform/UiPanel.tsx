/**
 * UiPanel - Platform UI panel/popover component
 * 
 * Elevated surface for menus, popovers, and floating panels.
 */

import { forwardRef } from 'react';
import styles from './Platform.module.css';

export interface UiPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Add a caret/arrow pointing to anchor */
  caret?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

/**
 * Elevated panel with glass effect for popovers and menus.
 */
export const UiPanel = forwardRef<HTMLDivElement, UiPanelProps>(
  function UiPanel({ caret, className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={`${styles.panel} ${className || ''}`}
        {...props}
      >
        {caret && <div className={`${styles.panelCaret} ${styles[`caret${caret.charAt(0).toUpperCase()}${caret.slice(1)}`]}`} />}
        {children}
      </div>
    );
  }
);

export interface UiMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Menu item for use within UiPanel.
 */
export const UiMenuItem = forwardRef<HTMLButtonElement, UiMenuItemProps>(
  function UiMenuItem({ icon, className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={`${styles.menuItem} ${className || ''}`}
        {...props}
      >
        {icon && <span className={styles.menuItemIcon}>{icon}</span>}
        <span>{children}</span>
      </button>
    );
  }
);

/**
 * Divider for menus.
 */
export function UiMenuDivider() {
  return <div className={styles.menuDivider} />;
}

