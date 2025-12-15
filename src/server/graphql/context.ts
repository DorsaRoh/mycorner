import type { Request, Response } from 'express';
import type { DbUser } from '../db';

/**
 * GraphQL context available to all resolvers
 */
export interface GraphQLContext {
  req: Request;
  res: Response;
  user?: DbUser;
  anonymousId?: string;
}

/**
 * Get the effective owner ID for page operations
 * Returns user ID if authenticated, anonymous session ID otherwise
 */
export function getOwnerId(context: GraphQLContext): string {
  return context.user?.id || context.anonymousId || 'unknown';
}

/**
 * Check if the current context can modify a page
 * Checks both owner_id and user_id for ownership
 */
export function canModifyPage(context: GraphQLContext, pageOwnerId: string, pageUserId?: string | null): boolean {
  // Check against owner_id
  if (context.user?.id === pageOwnerId) return true;
  if (context.anonymousId === pageOwnerId) return true;
  // Also check against user_id (for pages created by authenticated users)
  if (pageUserId && context.user?.id === pageUserId) return true;
  return false;
}
