/**
 * Local draft storage for anonymous page editing.
 * Drafts are stored in localStorage until the user publishes (which requires auth).
 */

import type { Block, BackgroundConfig } from '@/shared/types';

export interface DraftData {
  id: string;
  title: string;
  blocks: Block[];
  background?: BackgroundConfig;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_PREFIX = 'mycorner:draft:';
const ACTIVE_DRAFT_KEY = 'mycorner:activeDraftId';
const PENDING_PUBLISH_KEY = 'mycorner:pendingPublish';
const USER_INTERACTED_KEY = 'mycorner:hasInteracted';
const STARTER_DISMISSED_PREFIX = 'mycorner:starterDismissed:';

/**
 * Generate a unique draft ID
 */
export function generateDraftId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get the active draft ID (the one the user was last working on)
 */
export function getActiveDraftId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_DRAFT_KEY);
}

/**
 * Set the active draft ID
 */
export function setActiveDraftId(draftId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_DRAFT_KEY, draftId);
}

/**
 * Clear the active draft ID
 */
export function clearActiveDraftId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACTIVE_DRAFT_KEY);
}

/**
 * Get a draft by ID
 */
export function getDraft(draftId: string): DraftData | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = localStorage.getItem(`${STORAGE_PREFIX}${draftId}`);
    if (!data) return null;
    return JSON.parse(data) as DraftData;
  } catch {
    return null;
  }
}

/**
 * Save a draft
 */
export function saveDraft(draft: DraftData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${draft.id}`, JSON.stringify(draft));
  } catch (e) {
    console.error('Failed to save draft:', e);
  }
}

/**
 * Delete a draft
 */
export function deleteDraft(draftId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${STORAGE_PREFIX}${draftId}`);
  
  // Clear active draft if it matches
  if (getActiveDraftId() === draftId) {
    clearActiveDraftId();
  }
}

/**
 * Get all draft IDs
 */
export function getAllDraftIds(): string[] {
  if (typeof window === 'undefined') return [];
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      ids.push(key.slice(STORAGE_PREFIX.length));
    }
  }
  return ids;
}

/**
 * Auth continuation data - stores intent and context when auth is triggered.
 * This allows resuming the user's action after OAuth redirect.
 */
export interface AuthContinuation {
  /** What action to continue after auth */
  intent: 'publish';
  /** The draft ID being edited */
  draftId: string;
  /** Route to return to (e.g., /edit/draft_xxx) */
  returnTo: string;
  /** When this continuation was created */
  timestamp: number;
  /** Local revision number to guard against stale continuations */
  localRevision?: number;
}

const AUTH_CONTINUATION_KEY = 'mycorner:authContinuation';
const CONTINUATION_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Set auth continuation for resuming after OAuth
 * Uses localStorage instead of sessionStorage because sessionStorage can be lost
 * during OAuth redirects (especially on mobile browsers or cross-origin flows)
 */
export function setAuthContinuation(continuation: Omit<AuthContinuation, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  const data: AuthContinuation = {
    ...continuation,
    timestamp: Date.now(),
  };
  localStorage.setItem(AUTH_CONTINUATION_KEY, JSON.stringify(data));
}

/**
 * Get auth continuation if valid and not expired
 */
export function getAuthContinuation(): AuthContinuation | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = localStorage.getItem(AUTH_CONTINUATION_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data) as AuthContinuation;
    // Expire after 15 minutes
    if (Date.now() - parsed.timestamp > CONTINUATION_EXPIRY_MS) {
      clearAuthContinuation();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clear auth continuation
 */
export function clearAuthContinuation(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_CONTINUATION_KEY);
}

// Legacy aliases for backwards compatibility
export type PendingPublish = AuthContinuation;

export function setPendingPublish(draftId: string, returnTo?: string): void {
  setAuthContinuation({
    intent: 'publish',
    draftId,
    returnTo: returnTo || `/edit/${draftId}`,
  });
}

export function getPendingPublish(): AuthContinuation | null {
  return getAuthContinuation();
}

export function clearPendingPublish(): void {
  clearAuthContinuation();
}

/**
 * Check if user has interacted with the canvas (used to hide placeholder)
 */
export function hasUserInteracted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(USER_INTERACTED_KEY) === 'true';
}

/**
 * Mark that user has interacted with the canvas
 */
export function setUserInteracted(value: boolean = true): void {
  if (typeof window === 'undefined') return;
  if (value) {
    localStorage.setItem(USER_INTERACTED_KEY, 'true');
  } else {
    localStorage.removeItem(USER_INTERACTED_KEY);
  }
}

/**
 * Check if starter mode has been dismissed for a specific draft
 */
export function hasStarterBeenDismissed(draftId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${STARTER_DISMISSED_PREFIX}${draftId}`) === 'true';
}

/**
 * Mark starter mode as dismissed for a specific draft
 */
export function setStarterDismissed(draftId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STARTER_DISMISSED_PREFIX}${draftId}`, 'true');
}

/**
 * Publish toast data - stores the URL to show in toast after navigation
 */
export interface PublishToastData {
  url: string;
  timestamp: number;
}

const PUBLISH_TOAST_KEY = 'mycorner:publishToast';
const PUBLISH_TOAST_EXPIRY_MS = 30 * 1000; // 30 seconds

/**
 * Set publish toast data to show after navigation
 */
export function setPublishToastData(url: string): void {
  if (typeof window === 'undefined') return;
  const data: PublishToastData = {
    url,
    timestamp: Date.now(),
  };
  sessionStorage.setItem(PUBLISH_TOAST_KEY, JSON.stringify(data));
}

/**
 * Get publish toast data if valid and not expired
 */
export function getPublishToastData(): PublishToastData | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = sessionStorage.getItem(PUBLISH_TOAST_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data) as PublishToastData;
    // Expire after 30 seconds
    if (Date.now() - parsed.timestamp > PUBLISH_TOAST_EXPIRY_MS) {
      clearPublishToastData();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clear publish toast data
 */
export function clearPublishToastData(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PUBLISH_TOAST_KEY);
}
