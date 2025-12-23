/**
 * username generation and validation helpers.
 * 
 * used during oauth login to auto-generate usernames for new users.
 */

import { isReservedUsername } from '@/lib/routes';

// =============================================================================
// constants
// =============================================================================

// valid username pattern: lowercase alphanumeric and hyphens, 3-32 chars
const USERNAME_PATTERN = /^[a-z0-9-]{3,32}$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 32;
const MAX_COLLISION_ATTEMPTS = 100;

// =============================================================================
// username generation
// =============================================================================

/**
 * sanitize a string to be used as username base.
 * - lowercase
 * - replace non [a-z0-9] with -
 * - collapse multiple -
 * - trim leading/trailing -
 * - enforce min/max length
 */
function sanitize(input: string): string {
  let result = input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')  // replace non-alphanumeric with -
    .replace(/-+/g, '-')         // collapse multiple -
    .replace(/^-+|-+$/g, '');    // trim leading/trailing -
  
  // enforce max length first, then trim trailing -
  if (result.length > MAX_LENGTH) {
    result = result.slice(0, MAX_LENGTH).replace(/-+$/, '');
  }
  
  return result;
}

/**
 * generate random alphanumeric suffix for short usernames.
 */
function randomSuffix(length: number = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * generate a base username from email prefix or display name.
 * 
 * priority:
 * 1. email prefix (before @)
 * 2. name
 * 3. fallback to random
 * 
 * sanitization:
 * - lowercase
 * - replace non [a-z0-9] with -
 * - collapse multiple -
 * - trim leading/trailing -
 * - min 3 chars (append random if too short)
 * - max 32 chars (truncate)
 */
export function generateUsernameBase(email?: string | null, name?: string | null): string {
  let base = '';
  
  // try email prefix first
  if (email) {
    const atIndex = email.indexOf('@');
    if (atIndex > 0) {
      base = sanitize(email.slice(0, atIndex));
    }
  }
  
  // fallback to name if email didn't work
  if (!base && name) {
    base = sanitize(name);
  }
  
  // fallback to random if still nothing
  if (!base) {
    base = 'user-' + randomSuffix(6);
  }
  
  // ensure minimum length
  if (base.length < MIN_LENGTH) {
    base = base + randomSuffix(MIN_LENGTH - base.length + 2);
  }
  
  return base;
}

/**
 * generate a unique username by checking db and appending -2, -3, etc if needed.
 * 
 * @param base - the base username to start with
 * @param isUsernameTaken - async function to check if username exists
 * @returns unique username
 * @throws if cannot find unique username after MAX_COLLISION_ATTEMPTS
 */
export async function ensureUniqueUsername(
  base: string,
  isUsernameTaken: (username: string) => Promise<boolean>
): Promise<string> {
  // ensure base is valid
  let cleanBase = sanitize(base);
  if (cleanBase.length < MIN_LENGTH) {
    cleanBase = cleanBase + randomSuffix(MIN_LENGTH - cleanBase.length + 2);
  }
  
  // check if base is reserved
  if (isReservedUsername(cleanBase)) {
    cleanBase = cleanBase + '-' + randomSuffix(2);
  }
  
  // check if base is available
  if (!(await isUsernameTaken(cleanBase))) {
    return cleanBase;
  }
  
  // try numeric suffixes
  for (let i = 2; i <= MAX_COLLISION_ATTEMPTS; i++) {
    const candidate = `${cleanBase}-${i}`;
    
    // skip if too long
    if (candidate.length > MAX_LENGTH) {
      // truncate base to make room for suffix
      const maxBaseLen = MAX_LENGTH - String(i).length - 1;
      const truncatedBase = cleanBase.slice(0, maxBaseLen).replace(/-+$/, '');
      const truncatedCandidate = `${truncatedBase}-${i}`;
      
      if (truncatedCandidate.length <= MAX_LENGTH) {
        if (!isReservedUsername(truncatedCandidate) && !(await isUsernameTaken(truncatedCandidate))) {
          return truncatedCandidate;
        }
      }
      continue;
    }
    
    if (!isReservedUsername(candidate) && !(await isUsernameTaken(candidate))) {
      return candidate;
    }
  }
  
  // last resort: random suffix
  const fallback = `${cleanBase.slice(0, 20)}-${randomSuffix(6)}`;
  return fallback;
}

/**
 * validate username format.
 */
export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_PATTERN.test(username) && !isReservedUsername(username);
}

