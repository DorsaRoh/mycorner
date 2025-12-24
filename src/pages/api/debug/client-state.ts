/**
 * GET /api/debug/client-state
 * 
 * Development-only endpoint that returns debug information about
 * the current auth/session state as seen by the server.
 * 
 * Returns 404 in production.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

interface DebugState {
  nodeEnv: string;
  appOrigin: string | undefined;
  cookies: {
    present: string[];
    hasSession: boolean;
    hasDraftOwner: boolean;
    hasAnon: boolean;
    hasOAuthState: boolean;
  };
  session: {
    valid: boolean;
    userId: string | null;
    userEmail: string | null;
  };
  timestamp: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DebugState | { error: string }>
) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  // Only GET allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Prevent caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  // Parse cookies
  const cookieHeader = req.headers.cookie || '';
  const cookieNames: string[] = [];
  
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name] = cookie.trim().split('=');
      if (name) {
        cookieNames.push(name);
      }
    });
  }
  
  const hasSession = cookieNames.includes('yourcorner_session');
  const hasDraftOwner = cookieNames.includes('yourcorner_draft_owner');
  const hasAnon = cookieNames.includes('yourcorner_anon');
  const hasOAuthState = cookieNames.includes('yourcorner_oauth_state');
  
  // Try to get authenticated user
  let userId: string | null = null;
  let userEmail: string | null = null;
  let sessionValid = false;
  
  if (hasSession) {
    try {
      const { getUserFromRequest } = await import('@/server/auth/session');
      const user = await getUserFromRequest(req);
      
      if (user) {
        sessionValid = true;
        userId = user.id;
        userEmail = user.email;
      }
    } catch {
      // Session verification failed
    }
  }
  
  const state: DebugState = {
    nodeEnv: process.env.NODE_ENV || 'unknown',
    appOrigin: process.env.APP_ORIGIN || process.env.PUBLIC_URL,
    cookies: {
      present: cookieNames,
      hasSession,
      hasDraftOwner,
      hasAnon,
      hasOAuthState,
    },
    session: {
      valid: sessionValid,
      userId,
      userEmail,
    },
    timestamp: new Date().toISOString(),
  };
  
  return res.status(200).json(state);
}

