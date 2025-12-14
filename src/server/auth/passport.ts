import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import { store, StoredUser } from '../graphql/store';
import { authStore } from './store';

// Extend Express types for session
declare global {
  namespace Express {
    interface User extends StoredUser {}
  }
}

declare module 'express-session' {
  interface SessionData {
    anonymousId?: string; // Tracks pages created before auth
  }
}

export function configurePassport(): void {
  // Magic link verification strategy
  passport.use(
    'magic-link',
    new CustomStrategy((req, done) => {
      const token = req.query.token as string;
      if (!token) {
        return done(null, false);
      }

      const record = authStore.validateToken(token);
      if (!record) {
        return done(null, false);
      }

      // Find or create user
      let user = store.getUserByEmail(record.email);
      if (!user) {
        user = store.createUser(record.email);
      }

      // If there was an anonymous session, claim those pages
      if (record.sessionId) {
        store.claimAnonymousPages(record.sessionId, user.id);
      }

      return done(null, user);
    })
  );

  // Serialize user to session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser((id: string, done) => {
    const user = store.getUser(id);
    done(null, user || false);
  });
}

