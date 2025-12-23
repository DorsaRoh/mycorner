# YourCorner

A minimal "corner of the internet" product. Create your personal page with text, images, and links, publish it as static HTML, and share your unique URL.

## Production Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   PUBLIC PAGE VIEWS (No database, no app server)                           │
│                                                                             │
│   Browser → CDN → Object Storage (S3/R2)                                   │
│              ↓                                                              │
│   /u/{slug} → pages/{slug}/index.html (static HTML)                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   PUBLISH FLOW                                                              │
│                                                                             │
│   Editor (/new) → POST /api/publish                                        │
│                         ↓                                                   │
│   1. Validate PageDoc (Zod)                                                │
│   2. Render static HTML                                                     │
│   3. Upload to S3/R2 → pages/{slug}/index.html                             │
│   4. Upsert DB row (metadata only)                                         │
│   5. Purge CDN cache                                                        │
│   6. Return slug → redirect to /u/{slug}                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Non-negotiable production goals:**
1. Public page views do NOT hit the database or app server
2. Public pages are served as static HTML from CDN backed by object storage
3. Database is used only for editor/auth metadata and publish operations
4. Minimal, reliable, and cheap at scale

## Production Invariants

These invariants are enforced in code and must not be violated:

### 1. Public Pages are DB-Free
- `/u/[slug]` in production NEVER touches the database
- It redirects to `${S3_PUBLIC_BASE_URL}/pages/${slug}/index.html`
- The redirect uses only `S3_PUBLIC_BASE_URL` (no upload secrets required)

### 2. Storage Base URL Required in Production
- `S3_PUBLIC_BASE_URL` MUST be set in production
- Without it, `/api/publish` returns 503 Service Unavailable
- Without it, `/u/[slug]` returns 404

### 3. Upload-Before-DB Guarantee
- Publishing uploads HTML to storage BEFORE updating the database
- If storage upload fails, the DB is NOT updated
- This prevents "DB says published but artifact missing" bugs

### 4. Slug Generation Rules
- Slugs are based on `userId`, NEVER on `username`
- Format: `user-{first 8 chars of userId}`
- Existing slugs are immutable (reused on re-publish)
- Slugs must match `^[a-z0-9-]{1,64}$`

### 5. Bounded Cache TTL Without Purge
- If CDN purge is configured: HTML cache = 1 hour (purge on update)
- If CDN purge NOT configured: HTML cache = 5 minutes (bounded staleness)
- Assets are immutable: `max-age=31536000, immutable`

### 6. CDN Purge Targets (Multi-Origin)
When purging, we target all URLs users might hit:
- `${origin}/u/${slug}` for each origin in `APP_ORIGINS`
- `${S3_PUBLIC_BASE_URL}/pages/${slug}/index.html` - Storage artifact

Use `APP_ORIGINS` (comma-separated) for multiple domains (e.g., `https://example.com,https://www.example.com`).

### 7. No Silent Failures in Production
- Storage not configured → 503 (not silent success)
- Upload fails → 500 (not "published" in DB)
- Invalid slugs → 404 (early rejection)

## The Viral Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   User A visits User B's page (/u/alice)  ← Static HTML from CDN           │
│                 ↓                                                           │
│   Sees persistent CTA: "Make your own corner"                              │
│                 ↓                                                           │
│   Clicks → goes to /new (anonymous editor)                                 │
│                 ↓                                                           │
│   Edits their page (saved to localStorage)                                 │
│                 ↓                                                           │
│   Clicks Publish → redirected to auth                                      │
│                 ↓                                                           │
│   Signs in with Google → immediately published                             │
│   (NO username step - slug is auto-generated)                              │
│                 ↓                                                           │
│   Static HTML rendered → uploaded to storage                               │
│                 ↓                                                           │
│   Redirected to /u/{auto-slug}                                             │
│                 ↓                                                           │
│   User C visits User A's page → cycle repeats                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Routes

| Route | Description | Auth | Database |
|-------|-------------|------|----------|
| `/` | Landing page → CTA to /new | No | No |
| `/new` | Anonymous editor (localStorage) | No | No |
| `/u/[slug]` | Public page (static from CDN) | No | **No** |
| `/edit` | Authenticated editor | Yes | Yes |
| `/auth/google` | Google OAuth login | No | Yes |
| `/api/publish` | Publish draft → static HTML | Yes | Yes |
| `/api/upload` | Upload images | Yes | No (storage only) |
| `/api/healthz` | Health check | No | No |

### Legacy Routes

| Route | Behavior |
|-------|----------|
| `/[username]` | Redirects to `/u/[slug]` if published, else 404 |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (Pages Router) |
| Language | TypeScript |
| Validation | Zod |
| Database | PostgreSQL (Neon/Supabase) |
| ORM | Drizzle ORM |
| Object Storage | S3-compatible (Cloudflare R2 recommended) |
| CDN | Cloudflare |
| Auth | Passport.js + Google OAuth |

## How Publishing Works

1. **User edits on `/new`** - Draft stored in localStorage (`yourcorner:draft:v1`)
2. **User clicks Publish** - If not authenticated, redirected to `/auth/google?returnTo=/new?publish=1`
3. **After auth** - Back on `/new?publish=1`, calls `POST /api/publish` with PageDoc
4. **Server validates** - Zod validates the PageDoc
5. **Static HTML rendered** - Full HTML page with inline CSS, OG tags, CTA
6. **Uploaded to storage** - `pages/{slug}/index.html` in S3/R2
7. **DB updated** - Single row upserted with metadata
8. **CDN purged** - Cache cleared for the slug
9. **Redirect to `/u/[slug]`** - User sees their published page (served from CDN)

**No username onboarding step.** Slug is deterministic (`user-{userId.slice(0,8)}`) and immutable for MVP.

## Environment Variables

See `env.example.txt` for all variables.

```bash
# Required for production
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://your-domain.com
SESSION_SECRET=...  # Generate with: openssl rand -base64 32
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Object Storage (S3-compatible)
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=yourcorner
S3_REGION=auto
S3_PUBLIC_BASE_URL=https://cdn.yourcorner.com

# CDN Purge (optional but recommended)
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ZONE_ID=...

# App origins for CTA links and purge (comma-separated for multiple)
APP_ORIGINS=https://yourcorner.com,https://www.yourcorner.com

# Rate limiting provider: memory (default), upstash, or cloudflare
RATE_LIMIT_PROVIDER=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

For local development, the app uses SQLite by default (no config needed).

## CDN Configuration (Cloudflare)

See **[docs/cdn-cloudflare.md](docs/cdn-cloudflare.md)** for complete setup instructions including:
- Transform Rules for edge rewriting
- Cache Rules configuration
- Rate limiting at the edge
- Cache purge setup

Quick summary:
- **Option A (Recommended):** Cloudflare Transform Rule rewrites `/u/{slug}` → `/pages/{slug}/index.html`
- **Option B (Fallback):** Next.js route redirects to storage URL (307 Temporary)

### Required Environment Variables
```bash
S3_PUBLIC_BASE_URL=https://cdn.yourcorner.com
APP_ORIGINS=https://yourcorner.com,https://www.yourcorner.com
CLOUDFLARE_API_TOKEN=...  # optional, for cache purge
CLOUDFLARE_ZONE_ID=...    # optional, for cache purge
```

## Project Structure

```
src/
├── components/
│   ├── editor/           # Page editor components
│   │   ├── Editor.tsx    # Main editor (used by /new and /edit)
│   │   ├── Canvas.tsx    # Draggable block canvas
│   │   ├── usePublish.ts # Publish hook (calls /api/publish)
│   │   └── AuthGate.tsx  # Auth modal for publishing
│   └── viewer/           # Public page viewer (dev fallback only)
├── lib/
│   ├── schema/           # Zod schemas
│   │   └── page.ts       # PageDoc schema + validation
│   ├── themes.ts         # 10 theme presets
│   └── draft/            # LocalStorage draft management
│       ├── storage.ts    # getDraft, saveDraft, clearDraft
│       └── index.ts      # Format conversion helpers
├── pages/
│   ├── index.tsx         # Landing page → /new
│   ├── new.tsx           # Anonymous editor
│   ├── u/
│   │   └── [slug].tsx    # Redirect to storage (or dev fallback)
│   ├── edit/
│   │   └── index.tsx     # Authenticated editor
│   └── api/
│       ├── publish.ts    # Publish endpoint (render → upload → purge)
│       └── upload.ts     # Image upload endpoint
└── server/
    ├── index.ts          # Express + Next.js server
    ├── auth/             # Passport Google OAuth
    ├── db/               # Database (PostgreSQL/SQLite)
    ├── storage/          # S3-compatible storage client
    │   └── client.ts
    ├── cdn/              # CDN cache purge
    │   └── purge.ts
    └── render/           # Static HTML renderer
        └── renderPageHtml.ts
```

## PageDoc Schema

Pages are validated with Zod:

```typescript
interface PageDoc {
  version: 1;
  title?: string;
  bio?: string;
  themeId: string;
  blocks: Block[];
}

type Block = TextBlock | LinkBlock | ImageBlock;

interface TextBlock {
  id: string;
  type: 'text';
  x: number; y: number; width: number; height: number;
  content: { text: string };
  style?: { align?: 'left'|'center'|'right'; card?: boolean; radius?: 'none'|'sm'|'md'|'lg'|'full'; shadow?: 'none'|'sm'|'md'|'lg' };
}

interface LinkBlock {
  id: string;
  type: 'link';
  x: number; y: number; width: number; height: number;
  content: { label: string; url: string }; // URL validated
  style?: { ... };
}

interface ImageBlock {
  id: string;
  type: 'image';
  x: number; y: number; width: number; height: number;
  content: { url: string; alt?: string }; // URL validated at publish
  style?: { ... };
}
```

## Storage Layout

```
bucket/
├── pages/
│   ├── alice/
│   │   └── index.html       # Static page for /u/alice
│   └── user-a1b2c3d4/
│       └── index.html       # Auto-generated slug
└── assets/
    └── {userId}/
        └── {uuid}.{ext}     # Uploaded images
```

Cache headers:
- `pages/*`: `Cache-Control: public, max-age=3600` (purge on publish)
- `assets/*`: `Cache-Control: public, max-age=31536000, immutable`

## Themes

10 built-in themes in `/src/lib/themes.ts`:
- default, midnight, sunset, ocean, forest
- lavender, monochrome, coral, aurora, vintage

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (uses SQLite by default)
npm run dev

# Run tests
npm test
```

Open [http://localhost:3000](http://localhost:3000)

In development without S3 configured, `/u/[slug]` falls back to server-side rendering from the database.

## Deployment

### Deploy to Render

Use the `render.yaml` blueprint or create a Web Service:
- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`

### Deploy with Docker

```bash
docker build -t yourcorner .
docker run -p 3000:3000 --env-file .env.prod yourcorner
```

### Cloudflare R2 Setup

1. Create an R2 bucket
2. Create an API token with Object Read & Write permissions
3. Configure public access or add a custom domain
4. Set `S3_*` environment variables
5. (Optional) Configure Cloudflare cache purge with API token

## Security

- **CSP**: Static pages include Content-Security-Policy meta tag
- **Input validation**: All inputs validated with Zod at boundaries
- **URL validation**: Link URLs must be http/https; image URLs must be from allowed domains
- **Rate limiting**: Publish and upload endpoints are rate limited (memory, Upstash, or Cloudflare)
- **No inline scripts**: Static pages use no JavaScript
- **Upload protection**:
  - Auth required
  - Magic byte validation (not just Content-Type)
  - Max file size: 10MB
  - Max dimensions: 4096x4096
  - Per-user quota: 200MB

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm test` | Run schema validation tests |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript compiler check |
| `npm run smoke-test` | End-to-end publish flow test |
| `npm run audit-page -- --slug <slug>` | Audit cache headers for a page |
| `npm run db:push` | Push schema to database |

## Health Check

Use `/api/healthz` for deployment health checks:

```bash
curl https://your-domain.com/api/healthz
```

Returns:
- `200 OK` if all required subsystems are configured
- `503 Service Unavailable` if critical config is missing

Response includes status of: public pages, upload, and purge subsystems.

## Rate Limiting

Three rate limiting backends are supported:

| Provider | Use Case | Config |
|----------|----------|--------|
| `memory` | Development, single instance | Default |
| `upstash` | Production, multi-instance | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| `cloudflare` | Edge-based (configure in dashboard) | See [docs/cdn-cloudflare.md](docs/cdn-cloudflare.md) |

Set `RATE_LIMIT_PROVIDER` to choose. Defaults to `upstash` in production if configured.

## License

Private - All rights reserved
