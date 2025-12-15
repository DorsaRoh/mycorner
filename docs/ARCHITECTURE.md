# my-corner Architecture

## Overview

my-corner is a web app where users create personal "corner of the internet" pages with drag-and-drop objects (text, links, images), styling, and publishing.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, CSS Modules |
| API | Express.js wrapping Next.js, Apollo Server (GraphQL) |
| Database | PostgreSQL (via Supabase/Neon) |
| ORM | Drizzle ORM |
| File Storage | Supabase Storage |
| Auth | Passport.js with Google OAuth |
| Deployment | Render (web service) |

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Express   │────▶│  PostgreSQL │
│  (Next.js)  │◀────│  + GraphQL  │◀────│  (Supabase) │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       └───────────▶│  Supabase   │
                    │   Storage   │
                    └─────────────┘
```

## Directory Structure

```
src/
├── components/
│   ├── editor/     # Editor UI (Canvas, Block, Toolbar, etc.)
│   ├── viewer/     # Public page viewer components
│   └── effects/    # Visual effects renderer
├── lib/
│   ├── apollo/     # Apollo Client setup
│   ├── canvas/     # Canvas coordinate utilities
│   ├── draft/      # Local draft storage (localStorage)
│   ├── graphql/    # GraphQL queries/mutations
│   ├── hooks/      # Custom React hooks
│   └── starter/    # Starter template layouts
├── pages/
│   ├── edit/[id]   # Editor page (draft or server)
│   ├── p/[id]      # Public page by ID
│   ├── u/[username]# Public page by username
│   └── index       # Landing → redirects to new draft
├── server/
│   ├── api/        # REST endpoints (/api/*)
│   ├── auth/       # Passport.js Google OAuth
│   ├── db/         # Database connection + queries
│   ├── graphql/    # Apollo Server schema + resolvers
│   └── upload.ts   # File upload handling
├── shared/
│   ├── types/      # Shared TypeScript types
│   └── utils/      # Shared utilities
└── styles/         # Global CSS + page styles
```

## Database Schema

### users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | User email (unique) |
| google_sub | TEXT | Google account ID (unique) |
| name | TEXT | Display name |
| avatar_url | TEXT | Profile picture URL |
| username | TEXT | Username for /u/ routes (unique) |
| created_at | TIMESTAMP | Account creation time |
| updated_at | TIMESTAMP | Last update time |

### pages
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (page_xxx format) |
| user_id | UUID | Owner user ID (FK) |
| owner_id | TEXT | Session/user ID for anonymous drafts |
| title | TEXT | Page title |
| slug | TEXT | URL slug (usually username) |
| content | JSONB | Draft blocks array |
| background | JSONB | Draft background config |
| published_content | JSONB | Published blocks snapshot |
| published_background | JSONB | Published background snapshot |
| published_at | TIMESTAMP | Last publish time |
| published_revision | INT | Server revision at publish |
| is_published | BOOLEAN | Whether page is public |
| server_revision | INT | Optimistic locking counter |
| schema_version | INT | For forward compatibility |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update time |

### feedback / product_feedback
Simple tables for collecting user feedback on pages and the product.

## API Endpoints

### GraphQL (`/graphql`)

**Queries:**
- `me` - Current authenticated user
- `page(id)` - Get page by ID (owner or published)
- `publicPage(id)` - Get published page by ID
- `pageByUsername(username)` - Get published page by username
- `publicPages(limit)` - List recent published pages
- `usernameAvailable(username)` - Check username availability

**Mutations:**
- `createPage(input)` - Create new page (anonymous allowed)
- `updatePage(id, input)` - Update page with conflict detection
- `publishPage(id, input)` - Publish page (auth required)
- `forkPage(id)` - Fork a published page (auth required)
- `logout` - Log out current user
- `sendFeedback` - Submit page feedback
- `sendProductFeedback` - Submit product feedback

### REST (`/api/*`)

- `GET /api/me` - Current user profile
- `GET /api/username/check` - Check username availability
- `POST /api/onboarding` - Set username + create page
- `POST /api/publish` - Publish page (alternative to GraphQL)
- `POST /api/assets/upload` - Upload image file

### Auth (`/auth/*`)

- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - OAuth callback
- `POST /auth/logout` - Logout
- `GET /auth/status` - Check auth status

## Authentication Flow

1. User clicks "Sign in" or "Publish" (which requires auth)
2. App stores continuation intent in sessionStorage
3. Redirect to `/auth/google?returnTo=/edit/xxx`
4. Google OAuth flow completes
5. Callback redirects to returnTo with `?onboarding=true` if new user
6. New users set username via onboarding modal
7. Continuation intent resumes (e.g., publish)

## Draft vs Server Mode

**Draft Mode** (localStorage):
- URL: `/edit/draft_xxx`
- Content stored in localStorage
- No auto-save to server
- On publish: creates server page, copies content, publishes

**Server Mode** (PostgreSQL):
- URL: `/edit/page_xxx`
- Auto-save with 1s debounce
- Revision-based conflict detection
- On publish: validates revision, snapshots content

## Conflict Detection

Uses optimistic locking with `server_revision`:

1. Client loads page with `serverRevision: N`
2. Client makes changes, sends `baseServerRevision: N`
3. Server checks if current revision matches
4. If match: increment revision, save changes
5. If mismatch: return `conflict: true`

## File Uploads

1. Client sends file to `/api/assets/upload`
2. Server validates type (png, jpg, webp, gif) and size (15MB max)
3. File stored in Supabase Storage
4. Server returns public URL
5. Client stores URL (not base64) in block content

## Deployment

### Render (render.yaml)

- **Web Service**: Node.js, runs `npm start`
- **Environment**: Production env vars from Render dashboard
- **Database**: Connected to Supabase PostgreSQL
- **Storage**: Supabase Storage via API

### Environment Variables

See `.env.example` for full list:
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth
- `SESSION_SECRET` - Express session encryption
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` - Storage
- `CORS_ORIGIN` - Production domain

## Performance Considerations

- Public pages use `getServerSideProps` for SEO
- Editor code is client-side only
- Images served from Supabase CDN
- Debounced saves reduce API calls
- JSONB for efficient JSON queries

