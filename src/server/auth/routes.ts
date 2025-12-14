import { Router } from 'express';
import passport from 'passport';
import { authStore } from './store';

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
      return res.redirect('/?authenticated=true');
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

export { router as authRoutes, authStore };

