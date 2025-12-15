import { Router } from 'express';
import passport from 'passport';
import * as db from '../db';

const router = Router();

// Check if Google OAuth is configured
function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * GET /auth/google?returnTo=...
 * Initiates Google OAuth flow
 * Query params:
 *   - returnTo: URL to return to after auth (e.g., /edit/draft_123)
 */
router.get('/google', (req, res, next) => {
  // Check if Google OAuth is configured
  if (!isGoogleConfigured()) {
    const returnTo = req.query.returnTo as string || '/new';
    return res.redirect(`${returnTo}?error=google_not_configured`);
  }

  // Store return URL from query param
  const returnTo = req.query.returnTo as string | undefined;
  
  if (returnTo && returnTo.startsWith('/')) {
    req.session.returnTo = returnTo;
  } else {
    // Default to /new if no valid returnTo
    req.session.returnTo = '/new';
  }
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })(req, res, next);
});

/**
 * GET /auth/google/callback
 * Google OAuth callback
 * After successful auth, check if user needs onboarding
 */
router.get('/google/callback', (req, res, next) => {
  if (!isGoogleConfigured()) {
    return res.redirect('/new?error=google_not_configured');
  }

  passport.authenticate('google', (err: Error | null, user: Express.User | false) => {
    if (err) {
      console.error('Google auth error:', err);
      const returnTo = req.session.returnTo || '/new';
      return res.redirect(`${returnTo}?error=auth_error`);
    }
    if (!user) {
      const returnTo = req.session.returnTo || '/new';
      return res.redirect(`${returnTo}?error=auth_failed`);
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Login error:', loginErr);
        const returnTo = req.session.returnTo || '/new';
        return res.redirect(`${returnTo}?error=login_error`);
      }
      
      // Clear anonymous session ID after successful auth
      delete req.session.anonymousId;
      
      // Get return URL
      let returnTo = req.session.returnTo || '/new';
      delete req.session.returnTo;
      
      // Check if user needs onboarding (no username)
      if (!user.username) {
        // Add onboarding flag to the redirect URL
        const separator = returnTo.includes('?') ? '&' : '?';
        returnTo = `${returnTo}${separator}onboarding=true`;
      }
      
      return res.redirect(returnTo);
    });
  })(req, res, next);
});

/**
 * POST /auth/logout
 * Logs user out
 */
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

/**
 * GET /auth/logout
 * Alternative logout via GET (for simple links)
 */
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.redirect('/?error=logout_failed');
    }
    res.redirect('/');
  });
});

/**
 * GET /auth/status
 * Returns current auth status and user profile
 */
router.get('/status', (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.json({
      authenticated: false,
      user: null,
      needsOnboarding: false,
    });
  }

  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      username: req.user.username,
      avatarUrl: req.user.avatar_url,
    },
    needsOnboarding: !req.user.username,
  });
});

export { router as authRoutes };
