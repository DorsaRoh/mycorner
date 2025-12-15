import { Router } from 'express';
import passport from 'passport';

const router = Router();

/**
 * GET /auth/verify?token=xxx
 * Verifies magic link and logs user in
 */
router.get('/verify', (req, res, next) => {
  passport.authenticate('magic-link', (err: Error | null, user: Express.User | false) => {
    if (err) {
      return res.redirect('/?error=auth_error');
    }
    if (!user) {
      return res.redirect('/?error=invalid_token');
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return res.redirect('/?error=login_error');
      }
      // Clear anonymous session ID after successful claim
      delete req.session.anonymousId;
      
      // Redirect to return URL if present
      const returnTo = req.session.returnTo || '/';
      delete req.session.returnTo;
      
      return res.redirect(returnTo);
    });
  })(req, res, next);
});

/**
 * GET /auth/google?returnTo=...
 * Initiates Google OAuth flow
 * Query params:
 *   - returnTo: URL to return to after auth (e.g., /edit/draft_123)
 */
router.get('/google', (req, res, next) => {
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
 */
router.get('/google/callback', (req, res, next) => {
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
      
      // Redirect back to the editor (where pending publish will be handled)
      const returnTo = req.session.returnTo || '/new';
      delete req.session.returnTo;
      
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
 * GET /auth/status
 * Returns current auth status (for debugging)
 */
router.get('/status', (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.user ? { id: req.user.id, email: req.user.email } : null,
    anonymousId: req.session.anonymousId,
  });
});

export { router as authRoutes };
