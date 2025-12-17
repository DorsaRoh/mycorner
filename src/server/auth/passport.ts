import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import * as db from '../db';
import type { DbUser } from '../db';

// Extend Express types for session
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends DbUser {}
  }
}

declare module 'express-session' {
  interface SessionData {
    anonymousId?: string; // Tracks pages created before auth
    returnTo?: string; // Return URL after auth
    pendingPublishPageId?: string; // Page to publish after auth
  }
}

export function configurePassport(): void {
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
        async (req, _accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email from Google'), undefined);
            }

            const googleSub = profile.id; // This is the stable Google account ID
            const name = profile.displayName || undefined;
            const avatarUrl = profile.photos?.[0]?.value || undefined;

            // Upsert user - uses google_sub as primary identity
            const user = await db.upsertUserByGoogleSub({
              googleSub,
              email,
              name,
              avatarUrl,
            });

            // If there was an anonymous session, claim those pages
            const anonymousId = req.session?.anonymousId;
            if (anonymousId) {
              await db.claimAnonymousPages(anonymousId, user.id);
            }

            return done(null, user);
          } catch (error) {
            console.error('Google auth error:', error);
            return done(error as Error, undefined);
          }
        }
      )
    );
    console.log('✅ Google OAuth configured');
  } else {
    console.log('⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.');
  }

  // Serialize user to session (store only the user ID)
  passport.serializeUser((user, done) => {
    try {
      if (!user || !user.id) {
        console.error('serializeUser: Invalid user object', user);
        return done(new Error('Invalid user object'));
      }
      done(null, user.id);
    } catch (error) {
      console.error('serializeUser error:', error);
      done(error as Error);
    }
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await db.getUserById(id);
      done(null, user || false);
    } catch (error) {
      console.error('Deserialize user error:', error);
      done(error as Error, false);
    }
  });
}
