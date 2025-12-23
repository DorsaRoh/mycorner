import express from 'express';
import next from 'next';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { createApolloServer } from './graphql';
import { expressMiddleware } from '@apollo/server/express4';
import { configurePassport, authRoutes } from './auth';
import { createUploadRouter } from './upload';
import { createApiRouter } from './api';
import { getConfig, validateConfig } from '../lib/config';
import { initDatabase } from './db';
import { generalApiLimit, authLimit, uploadLimit } from './rateLimit';

// Validate configuration at startup
validateConfig();
const config = getConfig();

const dev = config.isDev;
const port = config.port;

const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  // Initialize database
  await initDatabase();

  await app.prepare();

  const server = express();

  // Trust proxy for rate limiting behind reverse proxy
  if (!dev) {
    server.set('trust proxy', 1);
  }

  // Core middleware
  server.use(cors({
    origin: config.corsOrigin || (dev ? 'http://localhost:3000' : undefined),
    credentials: true,
  }));
  
  // JSON body limit: 12MB to allow base64 image uploads via /api/upload
  // (base64 encoding adds ~33% overhead, so 12MB supports ~9MB files)
  server.use(express.json({ limit: '12mb' }));
  server.use(express.urlencoded({ limit: '1mb', extended: true }));

  // Session configuration
  server.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true, // Allow anonymous sessions
    cookie: {
      secure: !dev,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      // Use 'lax' for both dev and prod - 'strict' breaks OAuth flows because
      // the browser won't send cookies on cross-site redirects from Google OAuth
      sameSite: 'lax',
    },
  }));

  // Passport initialization
  configurePassport();
  server.use(passport.initialize());
  server.use(passport.session());

  // Generate anonymous ID for session if needed
  server.use((req, _res, next) => {
    if (!req.session.anonymousId && !req.user) {
      req.session.anonymousId = `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    next();
  });

  // Auth routes with rate limiting
  server.use('/auth', authLimit, authRoutes);

  // Asset upload routes (multipart, before JSON middleware applies)
  server.use('/api/assets', uploadLimit, createUploadRouter());

  // API routes (me, onboarding, publish)
  server.use('/api', generalApiLimit, createApiRouter());

  // Apollo Server setup
  const apolloServer = createApolloServer();
  await apolloServer.start();

  server.use(
    '/graphql',
    generalApiLimit,
    expressMiddleware(apolloServer, {
      context: async ({ req, res }) => ({
        req,
        res,
        user: req.user,
        anonymousId: req.session.anonymousId,
      }),
    })
  );

  // Health check endpoint
  server.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      env: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  });

  // Let Next.js handle all other routes
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  server.listen(port, () => {
    console.log(`🚀 Server ready at http://localhost:${port}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${port}/graphql`);
    if (!dev) {
      console.log(`🌐 Public URL: ${config.publicUrl}`);
    }
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
