import express from 'express';
import next from 'next';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { createApolloServer } from './graphql';
import { expressMiddleware } from '@apollo/server/express4';
import { configurePassport, authRoutes } from './auth';
import { createUploadRouter } from './upload';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const server = express();

  // Core middleware
  server.use(cors({
    origin: dev ? 'http://localhost:3000' : process.env.CORS_ORIGIN,
    credentials: true,
  }));
  
  // JSON body limit: 1MB is plenty for page metadata + block data (no base64 blobs)
  // Large files should use the /api/assets/upload endpoint instead
  server.use(express.json({ limit: '1mb' }));
  server.use(express.urlencoded({ limit: '1mb', extended: true }));

  // Session configuration
  server.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: true, // Allow anonymous sessions
    cookie: {
      secure: !dev,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
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

  // Auth routes
  server.use('/auth', authRoutes);

  // Asset upload routes (multipart, before JSON middleware applies)
  server.use('/api/assets', createUploadRouter());

  // Apollo Server setup
  const apolloServer = createApolloServer();
  await apolloServer.start();

  server.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req, res }) => ({
        req,
        res,
        user: req.user,
        anonymousId: req.session.anonymousId,
      }),
    })
  );

  // Let Next.js handle all other routes
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  server.listen(port, () => {
    console.log(`🚀 Server ready at http://localhost:${port}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${port}/graphql`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
