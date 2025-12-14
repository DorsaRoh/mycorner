import type { Request, Response } from 'express';
import type { StoredUser } from './store';

/**
 * GraphQL context available to all resolvers
 */
export interface GraphQLContext {
  req: Request;
  res: Response;
  user?: StoredUser;
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
 */
export function canModifyPage(context: GraphQLContext, pageOwnerId: string): boolean {
  if (context.user?.id === pageOwnerId) return true;
  if (context.anonymousId === pageOwnerId) return true;
  return false;
}
