/**
 * Debug endpoint to diagnose edit redirect loop issues.
 * 
 * GET /api/debug/edit-loop?pageId=page_xxx
 * 
 * Returns diagnostic information about:
 * - Authentication state
 * - Cookie state
 * - Page ownership
 * 
 * Only available in development or when DEBUG_AUTH is set.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { 
  getUserIdFromCookies,
  getDraftOwnerTokenFromCookies,
} from '@/server/auth/session';

interface DiagnosticsResponse {
  timestamp: string;
  environment: string;
  auth: {
    isAuthenticated: boolean;
    userId: string | null;
    hasSessionCookie: boolean;
    hasDraftOwnerCookie: boolean;
    draftOwnerTokenPrefix: string | null;
  };
  page?: {
    requestedPageId: string | null;
    exists: boolean;
    ownerId: string | null;
    ownerIdPrefix: string | null;
    userId: string | null;
    isPublished: boolean;
    ownershipMatch: boolean;
    ownershipReason: string;
  };
  cookies: {
    raw: string | undefined;
    parsed: Record<string, string>;
  };
  recommendation: string;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      // Only show yourcorner cookies, truncate values for security
      if (name.startsWith('yourcorner')) {
        const value = decodeURIComponent(rest.join('='));
        cookies[name] = value.length > 30 ? value.slice(0, 30) + '...' : value;
      }
    }
  });
  
  return cookies;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DiagnosticsResponse | { error: string }>
) {
  // Only allow in development or with explicit debug flag
  const isDev = process.env.NODE_ENV !== 'production';
  const hasDebugFlag = process.env.DEBUG_AUTH === 'true';
  
  if (!isDev && !hasDebugFlag) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const cookieHeader = req.headers.cookie;
  const pageId = req.query.pageId as string | undefined;
  
  // Get auth info
  const userId = await getUserIdFromCookies(cookieHeader);
  const draftToken = getDraftOwnerTokenFromCookies(cookieHeader);
  
  const diagnostics: DiagnosticsResponse = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    auth: {
      isAuthenticated: !!userId,
      userId: userId ? userId.slice(0, 20) + '...' : null,
      hasSessionCookie: cookieHeader?.includes('yourcorner_session') ?? false,
      hasDraftOwnerCookie: cookieHeader?.includes('yourcorner_draft_owner') ?? false,
      draftOwnerTokenPrefix: draftToken ? draftToken.slice(0, 30) + '...' : null,
    },
    cookies: {
      raw: cookieHeader ? cookieHeader.slice(0, 200) + (cookieHeader.length > 200 ? '...' : '') : undefined,
      parsed: parseCookies(cookieHeader),
    },
    recommendation: '',
  };
  
  // Check page if requested
  if (pageId) {
    try {
      const db = await import('@/server/db');
      const page = await db.getPageById(pageId);
      
      if (page) {
        // Check ownership
        let ownershipMatch = false;
        let ownershipReason = '';
        
        if (userId && page.user_id === userId) {
          ownershipMatch = true;
          ownershipReason = 'Authenticated user owns this page';
        } else if (draftToken && page.owner_id === draftToken && !page.user_id) {
          ownershipMatch = true;
          ownershipReason = 'Draft token matches and page is unclaimed';
        } else if (page.user_id && userId !== page.user_id) {
          ownershipReason = 'Page owned by different user';
        } else if (page.owner_id && draftToken !== page.owner_id) {
          ownershipReason = `Draft token mismatch: cookie=${draftToken?.slice(0, 20)}, page=${page.owner_id?.slice(0, 20)}`;
        } else if (!userId && !draftToken) {
          ownershipReason = 'No auth credentials (no session, no draft token)';
        } else {
          ownershipReason = 'Unknown ownership failure';
        }
        
        diagnostics.page = {
          requestedPageId: pageId,
          exists: true,
          ownerId: page.owner_id || null,
          ownerIdPrefix: page.owner_id ? page.owner_id.slice(0, 30) + '...' : null,
          userId: page.user_id || null,
          isPublished: !!page.is_published,
          ownershipMatch,
          ownershipReason,
        };
      } else {
        diagnostics.page = {
          requestedPageId: pageId,
          exists: false,
          ownerId: null,
          ownerIdPrefix: null,
          userId: null,
          isPublished: false,
          ownershipMatch: false,
          ownershipReason: 'Page does not exist',
        };
      }
    } catch (error) {
      diagnostics.page = {
        requestedPageId: pageId,
        exists: false,
        ownerId: null,
        ownerIdPrefix: null,
        userId: null,
        isPublished: false,
        ownershipMatch: false,
        ownershipReason: `Database error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
  }
  
  // Generate recommendation
  if (!diagnostics.auth.isAuthenticated && !diagnostics.auth.hasDraftOwnerCookie) {
    diagnostics.recommendation = 'No authentication. User should be redirected to /new to create a fresh page.';
  } else if (diagnostics.page && !diagnostics.page.exists) {
    diagnostics.recommendation = 'Page does not exist. This is likely a stale URL. User should be redirected to /new.';
  } else if (diagnostics.page && !diagnostics.page.ownershipMatch) {
    diagnostics.recommendation = `Ownership mismatch: ${diagnostics.page.ownershipReason}. This could cause a redirect loop if the code tries to create a new page instead of showing an error.`;
  } else if (diagnostics.page?.ownershipMatch) {
    diagnostics.recommendation = 'Everything looks good. Page should load successfully.';
  } else {
    diagnostics.recommendation = 'Unable to determine issue. Check server logs.';
  }
  
  return res.status(200).json(diagnostics);
}

