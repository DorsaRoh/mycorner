/**
 * UiModal - Platform UI modal component
 * 
 * Full-screen overlay modal with consistent styling.
 * Note: Modal overlays use a fixed backdrop, so they don't need
 * background-adaptive tokens - they create their own context.
 */

import { forwardRef, useEffect } from 'react';
import styles from './Platform.module.css';

export interface UiModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Prevent closing on overlay click */
  persistent?: boolean;
  children: React.ReactNode;
}

/**
 * Modal overlay with backdrop.
 */
export function UiModal({ isOpen, onClose, persistent, children }: UiModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !persistent) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, persistent]);

  if (!isOpen) return null;

  return (
    <div 
      className={styles.modalOverlay}
      onClick={persistent ? undefined : onClose}
    >
      <div 
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export interface UiModalHeaderProps {
  children: React.ReactNode;
}

export function UiModalHeader({ children }: UiModalHeaderProps) {
  return <div className={styles.modalHeader}>{children}</div>;
}

export interface UiModalBodyProps {
  children: React.ReactNode;
}

export function UiModalBody({ children }: UiModalBodyProps) {
  return <div className={styles.modalBody}>{children}</div>;
}

export interface UiModalFooterProps {
  children: React.ReactNode;
}

export function UiModalFooter({ children }: UiModalFooterProps) {
  return <div className={styles.modalFooter}>{children}</div>;
}

export interface UiModalTitleProps {
  children: React.ReactNode;
}

export function UiModalTitle({ children }: UiModalTitleProps) {
  return <h2 className={styles.modalTitle}>{children}</h2>;
}

export interface UiModalSubtitleProps {
  children: React.ReactNode;
}

export function UiModalSubtitle({ children }: UiModalSubtitleProps) {
  return <p className={styles.modalSubtitle}>{children}</p>;
}

