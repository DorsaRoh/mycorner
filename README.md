# itsmycorner

> Create your own corner of the internet. A simple, beautiful personal page that's entirely yours.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Single Source of Truth](#single-source-of-truth)
- [Data Model](#data-model)
- [Core User Journeys](#core-user-journeys)
- [How to Inspect Data](#how-to-inspect-data)
- [Security & Access Control](#security--access-control)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Common Debugging Playbook](#common-debugging-playbook)

---

## Quick Start

```bash
# Install dependencies
npm install

# Run in development (SQLite, no external services needed)
npm run dev:local

# Run with .env.local (PostgreSQL + Supabase)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  /             Landing page with CTA → /new                                 │
│  /new          Anonymous editor (localStorage drafts)                       │
│  /edit         Authenticated editor (server-synced)                         │
│  /{username}   Published public page (ISR)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXPRESS + NEXT.js SERVER                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  src/server/index.ts          ← Custom Express server entry point           │
│  │                                                                          │
│  ├── /auth/google/*           ← Google OAuth (Passport.js)                  │
│  ├── /api/*                   ← REST API routes                             │
│  ├── /graphql                 ← GraphQL endpoint (Apollo)                   │
│  ├── /api/assets/*            ← Image upload (multer)                       │
│  └── Next.js pages            ← SSR/ISR pages                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌─────────────────────┐ ┌────────────────────────────┐
│      DATABASE        │ │   IMAGE STORAGE     │ │   PAGE STORAGE (CDN)       │
├──────────────────────┤ ├─────────────────────┤ ├────────────────────────────┤
│ PostgreSQL (prod)    │ │ Supabase Storage    │ │ Cloudflare R2              │
│ SQLite (dev)         │ │ (or local disk)     │ │ pages/{slug}/index.html    │
│                      │ │                     │ │ assets/{userId}/{uuid}.ext │
│ Drizzle ORM          │ │                     │ │                            │
│ src/server/db/*      │ │ src/server/storage  │ │ src/server/storage/client  │
└──────────────────────┘ └─────────────────────┘ └────────────────────────────┘
```

### Tech Stack

| Layer           | Technology                                  | Files                                      |
| --------------- | ------------------------------------------- | ------------------------------------------ |
| **Framework**   | Next.js 14 (Pages Router)                   | `src/pages/*`                              |
| **Server**      | Express.js (custom server)                  | `src/server/index.ts`                      |
| **Database**    | Drizzle ORM (PostgreSQL / SQLite)           | `src/server/db/*`                          |
| **Auth**        | Passport.js + Google OAuth                  | `src/server/auth/*`                        |
| **Session**     | HMAC-signed JWT cookies                     | `src/server/auth/session.ts`               |
| **Validation**  | Zod schemas                                 | `src/lib/schema/page.ts`, `src/server/db/validation.ts` |
| **Storage**     | Supabase Storage / S3-compatible (R2)       | `src/server/storage.ts`, `src/server/storage/client.ts` |
| **CDN**         | Cloudflare (purge on publish)               | `src/server/cdn/purge.ts`                  |
| **Rate Limit**  | In-memory / Upstash Redis                   | `src/server/rateLimit/*`                   |
| **Hosting**     | Fly.io                                      | `fly.toml`, `Dockerfile`                   |

---

## Single Source of Truth

| Concern                     | Canonical File(s)                                                          |
| --------------------------- | -------------------------------------------------------------------------- |
| **Database Schema**         | `src/server/db/schema.ts` (Drizzle ORM)                                    |
| **Database Operations**     | `src/server/db/index.ts` (facade), `src/server/db/postgres.ts`, `src/server/db/sqlite.ts` |
| **Auth (Passport)**         | `src/server/auth/passport.ts`                                              |
| **Auth (Session/Cookies)**  | `src/server/auth/session.ts`                                               |
| **Auth Routes**             | `src/server/auth/routes.ts`, `src/pages/api/auth/*`                        |
| **Page Schema (Zod)**       | `src/lib/schema/page.ts`                                                   |
| **Page Rendering (SSR)**    | `src/pages/[slug].tsx`                                                     |
| **Page Rendering (Static)** | `src/server/render/renderPageHtml.ts`                                      |
| **Publishing**              | `src/pages/api/publish.ts`                                                 |
| **Storage (S3/R2)**         | `src/server/storage/client.ts`                                             |
| **Storage (Supabase)**      | `src/server/storage.ts`                                                    |
| **Routes/URLs**             | `src/lib/routes.ts`                                                        |
| **Config/Env Vars**         | `src/lib/config.ts`                                                        |
| **CDN Purge**               | `src/server/cdn/purge.ts`                                                  |
| **Rate Limiting**           | `src/server/rateLimit/index.ts`                                            |

---

## Data Model

### Database Tables

#### `users`

| Column       | Type      | Notes                                    |
| ------------ | --------- | ---------------------------------------- |
| `id`         | UUID      | Primary key, auto-generated              |
| `email`      | TEXT      | Unique, from Google OAuth                |
| `google_sub` | TEXT      | Unique, stable Google account identifier |
| `name`       | TEXT      | Display name (nullable)                  |
| `avatar_url` | TEXT      | Profile picture URL (nullable)           |
| `username`   | TEXT      | Unique, user-chosen slug (nullable)      |
| `created_at` | TIMESTAMP | Account creation time                    |
| `updated_at` | TIMESTAMP | Last update time                         |

**Where accessed:** `src/server/db/postgres.ts`, `src/server/db/sqlite.ts`

---

#### `pages`

| Column                 | Type      | Notes                                           |
| ---------------------- | --------- | ----------------------------------------------- |
| `id`                   | TEXT      | Primary key (`page_xxx` format)                 |
| `user_id`              | UUID      | FK → users.id (nullable for anonymous)          |
| `owner_id`             | TEXT      | Session ID or user ID (for claiming pages)      |
| `title`                | TEXT      | Page title (nullable)                           |
| `slug`                 | TEXT      | Unique, matches username for published pages    |
| `content`              | JSONB     | Draft content (Block[] as JSON)                 |
| `background`           | JSONB     | Draft background config                         |
| `published_content`    | JSONB     | Snapshot at publish time                        |
| `published_background` | JSONB     | Background at publish time                      |
| `published_at`         | TIMESTAMP | Last publish time                               |
| `published_revision`   | INTEGER   | `server_revision` at time of publish            |
| `is_published`         | BOOLEAN   | Whether page is public                          |
| `forked_from_id`       | TEXT      | Source page ID if forked                        |
| `server_revision`      | INTEGER   | Incremented on each save (conflict detection)   |
| `schema_version`       | INTEGER   | For future migrations                           |
| `created_at`           | TIMESTAMP | Page creation time                              |
| `updated_at`           | TIMESTAMP | Last update time                                |

**Where accessed:** `src/server/db/postgres.ts`, `src/server/db/sqlite.ts`

---

#### `feedback`

| Column       | Type      | Notes                         |
| ------------ | --------- | ----------------------------- |
| `id`         | UUID      | Primary key                   |
| `page_id`    | TEXT      | FK → pages.id                 |
| `message`    | TEXT      | Feedback message              |
| `email`      | TEXT      | Optional submitter email      |
| `created_at` | TIMESTAMP | Submission time               |

---

#### `product_feedback`

| Column       | Type      | Notes                         |
| ------------ | --------- | ----------------------------- |
| `id`         | UUID      | Primary key                   |
| `message`    | TEXT      | Feedback message              |
| `email`      | TEXT      | Optional submitter email      |
| `created_at` | TIMESTAMP | Submission time               |

---

#### `app_config` (utility)

| Column       | Type      | Notes                              |
| ------------ | --------- | ---------------------------------- |
| `key`        | TEXT      | Primary key                        |
| `value`      | TEXT      | Config value                       |
| `updated_at` | TIMESTAMP | Last update                        |

Used for one-time migrations and app-level flags.

---

### What's Public vs Private

| Data                      | Visibility                                     |
| ------------------------- | ---------------------------------------------- |
| `users.email`             | **Private** - never exposed to other users     |
| `users.google_sub`        | **Private** - internal auth identifier         |
| `users.name`              | **Private** - not used in public UI            |
| `users.username`          | **Public** - used as the canonical page URL    |
| `pages.published_content` | **Public** - rendered on `/{username}`         |
| `pages.content` (draft)   | **Private** - only accessible by owner         |
| `pages.slug`              | **Public** - part of URL                       |
| `feedback.*`              | **Private** - only visible to page owner       |

---

### Storage Paths

| Storage Type        | Path Pattern                      | Purpose                          |
| ------------------- | --------------------------------- | -------------------------------- |
| **Published Pages** | `pages/{slug}/index.html`         | Static HTML served from CDN      |
| **User Assets**     | `assets/{userId}/{uuid}.{ext}`    | Uploaded images                  |
| **Local Dev**       | `public/uploads/{filename}`       | Local dev image storage          |
| **SQLite DB**       | `data/my-corner.db`               | Local development database       |

---

## Core User Journeys

### 1. Create/Edit Page Flow

```
User visits /new
       │
       ▼
┌─────────────────────────────────────────┐
│  Editor loads in "draft" mode           │
│  - Blocks stored in localStorage        │
│  - Key: 'yourcorner:draft:v2'           │
│  - Auto-saves on every change           │
│                                         │
│  Files:                                 │
│  - src/pages/new.tsx                    │
│  - src/components/editor/Editor.tsx     │
│  - src/lib/draft/storage.ts             │
└─────────────────────────────────────────┘
       │
       ▼ (User clicks Publish)
┌─────────────────────────────────────────┐
│  Auth check (is user logged in?)        │
│                                         │
│  If NO: Show AuthGate modal             │
│         - src/components/editor/AuthGate│
│         - Redirects to Google OAuth     │
│         - Returns to /new?publish=1     │
└─────────────────────────────────────────┘
       │
       ▼ (Authenticated)
┌─────────────────────────────────────────┐
│  Username check (has username?)         │
│                                         │
│  If NO: Show OnboardingModal            │
│         - src/components/editor/Onboard │
│         - POST /api/onboarding          │
│         - Sets user.username            │
└─────────────────────────────────────────┘
       │
       ▼ (Has username)
       Publish flow (see below)
```

**Key Files:**
- `src/pages/new.tsx` - Anonymous editor page
- `src/pages/edit/index.tsx` - Authenticated editor page
- `src/components/editor/Editor.tsx` - Main editor component
- `src/lib/draft/storage.ts` - localStorage draft storage
- `src/components/editor/AuthGate.tsx` - Sign-in modal
- `src/components/editor/OnboardingModal.tsx` - Username picker

---

### 2. Publish Flow

```
POST /api/publish { doc: PageDoc }
       │
       ▼
┌─────────────────────────────────────────┐
│  1. Validate request with Zod           │
│     - PageDocSchema validation          │
│     - Block count limits (50 max)       │
│     - Size limits (500KB doc, 1MB HTML) │
│                                         │
│  Files:                                 │
│  - src/pages/api/publish.ts             │
│  - src/lib/schema/page.ts               │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  2. Render static HTML                  │
│     - Escape all user content           │
│     - Validate/resolve asset URLs       │
│     - Apply theme CSS                   │
│     - Include CSP headers               │
│                                         │
│  File:                                  │
│  - src/server/render/renderPageHtml.ts  │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  3. Upload to S3/R2 storage             │
│     - Key: pages/{slug}/index.html      │
│     - MUST succeed before DB update     │
│                                         │
│  File:                                  │
│  - src/server/storage/client.ts         │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  4. Update database                     │
│     - Set published_content = content   │
│     - Set is_published = true           │
│     - Set slug = username               │
│     - Conflict detection via revision   │
│                                         │
│  File:                                  │
│  - src/server/db/postgres.ts            │
│     → publishPage()                     │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  5. Purge CDN cache                     │
│     - Cloudflare zone purge             │
│     - Specific URLs: /{slug}            │
│                                         │
│  File:                                  │
│  - src/server/cdn/purge.ts              │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  6. Trigger ISR revalidation            │
│     - res.revalidate(`/${slug}`)        │
│     - Fresh content immediately         │
│                                         │
│  Response:                              │
│  { success: true, slug, url, publicUrl }│
└─────────────────────────────────────────┘
```

**Key Files:**
- `src/pages/api/publish.ts` - Main publish endpoint
- `src/server/render/renderPageHtml.ts` - Static HTML renderer
- `src/server/storage/client.ts` - S3/R2 upload
- `src/server/cdn/purge.ts` - CDN cache invalidation

---

### 3. View Published Page Flow

```
GET /{username}
       │
       ▼
┌─────────────────────────────────────────┐
│  Next.js ISR: getStaticProps            │
│                                         │
│  1. Validate slug format                │
│  2. Check reserved paths (404 if match) │
│  3. Fetch from database:                │
│     - Try getPageBySlug(slug)           │
│     - If not found, try by username     │
│  4. Return PageDoc for rendering        │
│                                         │
│  Revalidation: 60 seconds               │
│  On-demand via /api/publish             │
│                                         │
│  Files:                                 │
│  - src/pages/[slug].tsx                 │
│  - src/lib/pages/index.ts               │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  PublicPageView component renders       │
│  - ViewerCanvas (layout)                │
│  - ViewerBlock (per block)              │
│  - CTA button ("Make your own")         │
│  - FeedbackModal                        │
│                                         │
│  Files:                                 │
│  - src/components/viewer/PublicPageView │
│  - src/components/viewer/ViewerCanvas   │
│  - src/components/viewer/ViewerBlock    │
└─────────────────────────────────────────┘
```

**Key Files:**
- `src/pages/[slug].tsx` - Dynamic route with ISR
- `src/lib/pages/index.ts` - Data fetching (`getPublishedPageBySlug`)
- `src/components/viewer/PublicPageView.tsx` - Page renderer

---

## How to Inspect Data

### Via Drizzle Studio (Recommended for Dev)

```bash
# Local SQLite database
npm run db:studio:local

# Production PostgreSQL (requires .env.prod)
npm run db:studio
```

Opens a web UI at `http://localhost:4983` where you can browse tables, run queries, and edit data.

---

### Via PostgreSQL CLI (Production)

```bash
# Connect to production database
psql $DATABASE_URL
```

---

### Common SQL Queries

```sql
-- List recent users (emails, usernames, creation time)
SELECT id, email, username, name, created_at
FROM users
ORDER BY created_at DESC
LIMIT 20;

-- Find user by username
SELECT * FROM users
WHERE username = 'someuser';

-- Find user by email
SELECT * FROM users
WHERE email = 'user@example.com';

-- List pages for a specific user
SELECT id, title, slug, is_published, published_at, updated_at
FROM pages
WHERE user_id = 'uuid-here'
ORDER BY updated_at DESC;

-- Find page by slug
SELECT * FROM pages
WHERE slug = 'username';

-- View published pages only
SELECT p.id, p.slug, p.title, u.username, p.published_at
FROM pages p
JOIN users u ON p.user_id = u.id
WHERE p.is_published = true
ORDER BY p.published_at DESC
LIMIT 20;

-- Find pages with empty published content (debugging)
SELECT id, slug, user_id, published_at
FROM pages
WHERE is_published = true
  AND (published_content IS NULL OR published_content = '[]'::jsonb);

-- View page content (draft)
SELECT id, slug, content
FROM pages
WHERE slug = 'username';

-- View published content specifically
SELECT id, slug, published_content, published_background
FROM pages
WHERE slug = 'username';

-- Recent product feedback
SELECT * FROM product_feedback
ORDER BY created_at DESC
LIMIT 20;

-- Feedback for a specific page
SELECT f.*, p.slug
FROM feedback f
JOIN pages p ON f.page_id = p.id
WHERE p.slug = 'username'
ORDER BY f.created_at DESC;
```

---

### Inspect Supabase Storage (Images)

If using Supabase Storage for image uploads:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Storage** in the left sidebar
4. Click on the bucket (default: `uploads`)
5. Browse uploaded files

---

### Inspect R2/S3 Storage (Published Pages)

Published static HTML is stored in S3-compatible storage.

**Via Cloudflare Dashboard (R2):**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your account → **R2 Object Storage**
3. Click your bucket
4. Navigate to `pages/{slug}/index.html`

**Via AWS CLI (any S3-compatible):**
```bash
# List published pages
aws s3 ls s3://your-bucket/pages/ --endpoint-url $S3_ENDPOINT

# Download a page for inspection
aws s3 cp s3://your-bucket/pages/username/index.html ./page.html \
    --endpoint-url $S3_ENDPOINT
```

---

### Local Development Data

For local development with SQLite:

- **Database file:** `data/my-corner.db`
- **Image uploads:** `public/uploads/`

You can inspect SQLite directly:
```bash
sqlite3 data/my-corner.db

# List tables
.tables

# Describe users table
.schema users

# Query data
SELECT * FROM users;
```

---

## Security & Access Control

### Authentication Flow

1. **Anonymous users** can create and edit drafts (localStorage only)
2. **Publishing requires authentication** via Google OAuth
3. **Sessions** are stored in signed cookies (`yourcorner_session`)
4. **Session secret** (`SESSION_SECRET`) must be set in production

### Authorization Rules

| Action               | Who Can Do It                                |
| -------------------- | -------------------------------------------- |
| View published page  | Anyone                                       |
| Edit draft (local)   | Anyone (localStorage)                        |
| Edit saved page      | Page owner only (`user_id` or `owner_id`)    |
| Publish page         | Authenticated user (becomes owner)           |
| Delete page          | Not implemented (owner-only when added)      |
| View user email      | Never exposed via API                        |

### Validation & Sanitization

- **Zod schemas** validate all API inputs (`src/lib/schema/page.ts`, `src/server/db/validation.ts`)
- **HTML escaping** in static renderer (`src/server/render/renderPageHtml.ts`)
- **URL validation** - only http/https links allowed
- **Image URL whitelist** - only configured storage domains allowed

### Rate Limiting

| Endpoint      | Limit                          | File                           |
| ------------- | ------------------------------ | ------------------------------ |
| `/api/upload` | 20/min (200/min in dev)        | `src/server/rateLimit/index.ts`|
| `/api/publish`| 10/min (100/min in dev)        | `src/server/rateLimit/index.ts`|
| `/auth/*`     | Express rate-limit middleware  | `src/server/rateLimit.ts`      |

### Reserved Usernames

Defined in `src/server/db/validation.ts` and `src/lib/routes.ts`:

- System routes: `admin`, `api`, `auth`, `edit`, `new`, `graphql`, etc.
- Brand: `mycorner`, `corner`, `official`, `team`, etc.
- Common: `test`, `demo`, `null`, `undefined`, etc.

### Content Security Policy

Published static pages include CSP headers:
- `script-src 'none'` - No JavaScript execution
- `img-src 'self'` + configured storage domains
- See `src/server/render/renderPageHtml.ts`

### Notes on RLS (Row Level Security)

This app uses **application-level authorization** rather than database RLS:
- All DB queries go through `src/server/db/*`
- Owner checks happen in API handlers
- PostgreSQL connections use a single service role

---

## Environment Variables

### Required for Production

| Variable                  | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`            | PostgreSQL connection string                         |
| `GOOGLE_CLIENT_ID`        | Google OAuth client ID                               |
| `GOOGLE_CLIENT_SECRET`    | Google OAuth client secret                           |
| `SESSION_SECRET`          | Secret for signing session cookies (32+ chars)       |
| `S3_ENDPOINT`             | S3-compatible endpoint (e.g., R2)                    |
| `S3_BUCKET`               | Bucket name for page storage                         |
| `S3_ACCESS_KEY_ID`        | S3 access key                                        |
| `S3_SECRET_ACCESS_KEY`    | S3 secret key                                        |
| `S3_PUBLIC_BASE_URL`      | Public CDN URL for serving pages/assets              |
| `PUBLIC_URL` or `APP_ORIGIN` | App base URL (e.g., `https://www.itsmycorner.com`)  |

### Optional

| Variable                     | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `PORT`                       | Server port (default: 3000)                       |
| `CORS_ORIGIN`                | CORS allowed origin (defaults to PUBLIC_URL)      |
| `SUPABASE_URL`               | Supabase project URL (for image uploads)          |
| `SUPABASE_SERVICE_KEY`       | Supabase service role key                         |
| `SUPABASE_STORAGE_BUCKET`    | Supabase storage bucket (default: `uploads`)      |
| `CLOUDFLARE_API_TOKEN`       | Cloudflare API token for CDN purge                |
| `CLOUDFLARE_ZONE_ID`         | Cloudflare zone ID                                |
| `APP_ORIGINS`                | Comma-separated list of app origins (for purge)   |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Plausible analytics domain                      |
| `RATE_LIMIT_PROVIDER`        | `memory`, `upstash`, or `cloudflare`              |
| `UPSTASH_REDIS_REST_URL`     | Upstash Redis URL for rate limiting               |
| `UPSTASH_REDIS_REST_TOKEN`   | Upstash Redis token                               |

### Development Only

| Variable         | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `USE_SQLITE`     | Use SQLite instead of PostgreSQL                     |
| `DATABASE_PATH`  | SQLite database path (default: `./data/my-corner.db`)|

---

## Local Development

### Prerequisites

- Node.js 20+
- npm 9+

### Quick Start (No External Services)

```bash
# Install dependencies
npm install

# Run with SQLite (no external DB/storage needed)
npm run dev:local
```

This starts the app at `http://localhost:3001` with:
- SQLite database at `data/my-corner.db`
- Local disk storage at `public/uploads/`
- Google OAuth disabled (can't publish)

### Full Development Setup

1. **Create `.env.local`:**
   ```bash
   # Database
   DATABASE_URL=postgresql://user:pass@host:5432/dbname

   # Google OAuth
   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxx

   # Session
   SESSION_SECRET=your-32-char-secret-here

   # Storage (optional for dev - uses local disk without)
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=xxx

   # S3/R2 (optional for dev)
   S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
   S3_BUCKET=your-bucket
   S3_ACCESS_KEY_ID=xxx
   S3_SECRET_ACCESS_KEY=xxx
   S3_PUBLIC_BASE_URL=https://cdn.yourdomain.com

   # App URL
   PUBLIC_URL=http://localhost:3000
   ```

2. **Run migrations:**
   ```bash
   npm run db:push
   ```

3. **Start development server:**
   ```bash
npm run dev
   ```

### Database Commands

```bash
# Generate migration files
npm run db:generate

# Apply migrations
npm run db:migrate

# Push schema to database (development)
npm run db:push

# Open Drizzle Studio (local)
npm run db:studio:local

# Open Drizzle Studio (production)
npm run db:studio
```

---

## Deployment

### Fly.io (Current)

The app is deployed to Fly.io. See `fly.toml` for configuration.

```bash
# Deploy
fly deploy

# View logs
fly logs

# SSH into instance
fly ssh console
```

### Environment Variables on Fly.io

```bash
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set GOOGLE_CLIENT_ID="..."
fly secrets set GOOGLE_CLIENT_SECRET="..."
fly secrets set SESSION_SECRET="..."
fly secrets set S3_ENDPOINT="..."
fly secrets set S3_BUCKET="..."
fly secrets set S3_ACCESS_KEY_ID="..."
fly secrets set S3_SECRET_ACCESS_KEY="..."
fly secrets set S3_PUBLIC_BASE_URL="..."
fly secrets set PUBLIC_URL="https://www.itsmycorner.com"
```

### Docker

```bash
# Build image
npm run build-docker

# Run container
npm run start-docker
```

### Health Check

```bash
curl https://your-domain.com/health
# Returns: { "status": "ok", "env": "production", "timestamp": "..." }
```

---

## Common Debugging Playbook

### Published Page is Blank

**Symptoms:** `/{username}` shows empty page or 404

**Check:**
1. Is the page actually published?
   ```sql
   SELECT id, slug, is_published, published_content
   FROM pages WHERE slug = 'username';
   ```
2. Is `published_content` populated? (not null or empty)
3. Does the S3/R2 artifact exist?
   ```bash
   aws s3 ls s3://bucket/pages/username/index.html --endpoint-url $S3_ENDPOINT
   ```
4. Check logs for render errors:
   - Fly.io: `fly logs`
   - Look for `[Publish]` or `[/slug]` log lines

**Files to check:**
- `src/pages/[slug].tsx` - ISR data fetching
- `src/lib/pages/index.ts` - `getPublishedPageBySlug()`
- `src/pages/api/publish.ts` - Publish endpoint

---

### Missing Styles in Production

**Symptoms:** Page renders but styling is broken

**Check:**
1. Is the theme applied correctly?
   ```sql
   SELECT published_content->'themeId' FROM pages WHERE slug = 'username';
   ```
2. Check static HTML directly:
   ```bash
   curl https://cdn.yourdomain.com/pages/username/index.html | head -100
   ```
3. Look for CSP violations in browser console

**Files to check:**
- `src/server/render/renderPageHtml.ts` - Theme CSS generation
- `src/lib/themes.ts` - Theme definitions

---

### 401/403 Auth Errors

**Symptoms:** API returns "Authentication required"

**Check:**
1. Is the session cookie present? (DevTools → Application → Cookies)
2. Is `SESSION_SECRET` the same across deployments?
3. Cookie settings:
   - `sameSite: 'lax'` for OAuth compatibility
   - `secure: true` in production
4. Check OAuth callback URL matches configuration

**Files to check:**
- `src/server/auth/session.ts` - Cookie handling
- `src/server/auth/passport.ts` - OAuth flow

---

### Slug/Username Collisions

**Symptoms:** "Username is already taken" when it shouldn't be

**Check:**
1. Is username in reserved list?
   ```bash
   grep -i "username" src/server/db/validation.ts
   grep -i "username" src/lib/routes.ts
   ```
2. Check database:
   ```sql
   SELECT * FROM users WHERE username = 'desired-username';
   SELECT * FROM pages WHERE slug = 'desired-username';
   ```

**Files to check:**
- `src/server/db/validation.ts` - `RESERVED_USERNAMES`
- `src/lib/routes.ts` - `RESERVED_PATHS`

---

### Storage/Image Not Loading

**Symptoms:** Images show as broken in editor or published page

**Check:**
1. Is the image URL accessible? (try in browser)
2. For Supabase Storage:
   - Check bucket is public
   - Check SUPABASE_SERVICE_KEY is service_role (not anon)
3. For R2/S3:
   - Check S3_PUBLIC_BASE_URL is correct
   - Check CORS configuration on bucket
4. Check allowed domains in renderer:
   ```typescript
   // src/server/render/renderPageHtml.ts
   const ALLOWED_IMAGE_DOMAINS = ...
   ```

**Files to check:**
- `src/server/storage.ts` - Supabase upload
- `src/server/storage/client.ts` - S3/R2 upload
- `src/server/render/renderPageHtml.ts` - `isAllowedImageUrl()`

---

### Rate Limit Hit (429)

**Symptoms:** "Too many requests" error

**Check:**
1. Wait for reset period (check `Retry-After` header)
2. In dev, limits are 10x higher
3. Check rate limit provider:
   ```bash
   echo $RATE_LIMIT_PROVIDER  # memory, upstash, or cloudflare
   ```

**Files to check:**
- `src/server/rateLimit/index.ts` - Rate limit configuration

---

### CDN Not Updating After Publish

**Symptoms:** Old content shows after publishing

**Check:**
1. Is CDN purge configured?
   ```bash
   echo $CLOUDFLARE_API_TOKEN
   echo $CLOUDFLARE_ZONE_ID
   ```
2. Check purge result in logs: `[cdn purge]`
3. Manual purge:
   - Cloudflare Dashboard → Caching → Purge Cache
   - Enter URL: `https://yourdomain.com/{username}`

**Files to check:**
- `src/server/cdn/purge.ts` - Purge implementation
- `src/pages/api/publish.ts` - Purge call

---

## Directory Structure

```
mycorner/
├── src/
│   ├── components/
│   │   ├── canvas/          # Shared canvas components
│   │   ├── editor/          # Editor UI (Editor, Block, Canvas, etc.)
│   │   ├── effects/         # Visual effects
│   │   └── viewer/          # Public page viewer components
│   ├── lib/
│   │   ├── api/             # API client utilities
│   │   ├── canvas/          # Canvas utilities (coordinates, size)
│   │   ├── draft/           # Draft storage (localStorage)
│   │   ├── pages/           # Page data fetching
│   │   ├── schema/          # Zod schemas (PageDoc)
│   │   ├── starter/         # Starter templates
│   │   ├── config.ts        # Environment config
│   │   ├── routes.ts        # Route constants
│   │   └── themes.ts        # Theme definitions
│   ├── pages/
│   │   ├── api/             # API routes
│   │   │   ├── auth/        # OAuth endpoints
│   │   │   ├── debug/       # Debug endpoints
│   │   │   └── ...          # Other API routes
│   │   ├── edit/            # /edit page
│   │   ├── [slug].tsx       # /{username} dynamic route
│   │   ├── index.tsx        # Landing page
│   │   └── new.tsx          # /new anonymous editor
│   ├── server/
│   │   ├── api/             # Express API handlers
│   │   ├── auth/            # Passport.js + session
│   │   ├── cdn/             # CDN purge
│   │   ├── db/              # Database (Drizzle ORM)
│   │   ├── graphql/         # GraphQL (Apollo)
│   │   ├── rateLimit/       # Rate limiting
│   │   ├── render/          # Static HTML rendering
│   │   ├── storage/         # S3/R2 storage
│   │   ├── index.ts         # Server entry point
│   │   └── storage.ts       # Supabase storage
│   ├── shared/
│   │   ├── types/           # Shared TypeScript types
│   │   └── utils/           # Shared utilities
│   └── styles/              # CSS modules
├── data/                    # SQLite database (local dev)
├── docs/                    # Documentation
├── public/                  # Static files
│   └── uploads/             # Local dev image uploads
├── scripts/                 # Utility scripts
├── drizzle.config.ts        # Drizzle config (PostgreSQL)
├── drizzle.config.local.ts  # Drizzle config (SQLite)
├── fly.toml                 # Fly.io deployment
├── Dockerfile               # Docker build
├── package.json
└── tsconfig.json
```

---

## Additional Documentation

- `docs/ARCHITECTURE.md` - Detailed architecture notes
- `docs/SHIP_CHECKLIST.md` - Production deployment checklist
- `docs/CTA_FLOW_IMPLEMENTATION.md` - CTA button flow
- `docs/cdn-cloudflare.md` - Cloudflare CDN setup
- `docs/routing-audit.md` - Route structure audit
