import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
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
    returnTo?: string; // Return URL after auth
  }
}

export function configurePassport(): void {
  // Magic link verification strategy (kept for backwards compatibility)
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

  // Google OAuth Strategy
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: '/auth/google/callback',
          passReqToCallback: true,
        },
        (req, _accessToken, _refreshToken, profile, done) => {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email from Google'), undefined);
          }

          // Find or create user
          let user = store.getUserByEmail(email);
          if (!user) {
            user = store.createUser(email);
            // Set display name from Google profile
            if (profile.displayName) {
              user.displayName = profile.displayName;
            }
          }

          // If there was an anonymous session, claim those pages
          const anonymousId = req.session?.anonymousId;
          if (anonymousId) {
            store.claimAnonymousPages(anonymousId, user.id);
          }

          return done(null, user);
        }
      )
    );
  } else {
    console.log('⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.');
  }

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

