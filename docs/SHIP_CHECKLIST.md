# Ship Checklist

Production deployment checklist for my-corner.

## Phase 0: Repo Understanding ✅

- [x] Map codebase structure
- [x] Document architecture in `docs/ARCHITECTURE.md`
- [x] Identify save/publish flow
- [x] Identify PayloadTooLarge root cause

## Phase 1: Architecture ✅

- [x] Choose deployment architecture (Express + Render + Supabase)
- [x] Keep existing stack (minimal diff)

## Phase 2: Production Essentials

### 2.1 Environment + Config ✅

- [x] Create `.env.example` with all required vars
- [x] Create typed config module (`src/lib/config.ts`)
- [x] Validate env vars at boot
- [x] Separate dev vs prod URLs

### 2.2 Persistence Model ✅

- [x] PostgreSQL schema via Drizzle ORM (`src/server/db/schema.ts`)
- [x] SQLite fallback for development
- [x] JSONB for page content
- [x] Draft + published content snapshots
- [x] Server revision for conflict detection

### 2.3 PayloadTooLarge Fix ✅

- [x] Images upload to Supabase Storage (not base64)
- [x] 1MB body limit (sufficient for metadata)
- [x] Debounced saves via `useSaveController`
- [x] Error handling for large payloads

### 2.4 Routing ✅

- [x] `/` - Landing (redirects to new draft)
- [x] `/edit/[id]` - Editor (draft or server mode)
- [x] `/p/[id]` - Public page by ID
- [x] `/u/[username]` - Public page by username

### 2.5 Auth (Google) ✅

- [x] Google OAuth via Passport.js
- [x] Session persistence
- [x] Onboarding flow for username
- [x] Auth gating for publish

### 2.6 Security + Abuse Controls ✅

- [x] Zod validation for page JSON (`src/server/db/validation.ts`)
- [x] Rate limiting (`src/server/rateLimit.ts`)
- [x] Reserved usernames list
- [x] Owner-only page modifications
- [x] Public pages show published content only

### 2.7 Performance + Reliability ✅

- [x] Debounced auto-save
- [x] Conflict detection with revisions
- [x] Health check endpoint
- [x] Storage adapter for Supabase

### 2.8 Analytics + Monitoring ✅

- [x] Plausible Analytics (privacy-respecting)
- [x] Environment variable for domain

## Phase 3: Deployment

### 3.1 Deploy ✅

- [x] Create `render.yaml` for Render deployment
- [x] Environment variables documented
- [x] Health check configured

### 3.2 Database ✅

- [x] Drizzle ORM schema
- [x] Migration commands in package.json
- [x] PostgreSQL support for production

## Phase 4: Cleanup

### Code Quality

- [x] Add lint script
- [x] Add type-check script
- [ ] Add format script (prettier)
- [ ] Remove unused dependencies
- [ ] Remove unused components

### Testing

- [ ] Smoke test: create draft
- [ ] Smoke test: add object
- [ ] Smoke test: publish
- [ ] Smoke test: view public page

---

## Deployment Steps

### 1. Configure Object Storage (Cloudflare R2)

The app uses S3-compatible object storage for:
- Published static pages (`pages/{slug}/index.html`)
- User-uploaded images (`assets/{userId}/{uuid}.{ext}`)

**Required Environment Variables:**
- `S3_ENDPOINT` - R2 endpoint (e.g., `https://xxx.r2.cloudflarestorage.com`)
- `S3_BUCKET` - Bucket name
- `S3_ACCESS_KEY_ID` - R2 API token ID
- `S3_SECRET_ACCESS_KEY` - R2 API token secret
- `S3_PUBLIC_BASE_URL` - Public CDN URL (e.g., `https://cdn.yourdomain.com`)

**CORS Configuration (Required for Direct Uploads):**

The app uses presigned URLs for fast direct-to-R2 uploads from the browser.
Configure CORS on your R2 bucket to allow PUT requests:

```json
[
  {
    "AllowedOrigins": ["https://yourdomain.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "x-amz-*"],
    "MaxAgeSeconds": 3600
  }
]
```

In Cloudflare R2 dashboard:
1. Go to R2 → Your Bucket → Settings → CORS Policy
2. Add the above policy (replace `yourdomain.com` with your actual domain)
3. For development, add `http://localhost:3000` to AllowedOrigins

### 2. Create Supabase Project (Database)

1. Go to https://supabase.com and create a new project
2. Copy the project URL and service role key
3. Get the PostgreSQL connection string from Database Settings

### 3. Create Render Web Service

1. Go to https://render.com and create a new Web Service
2. Connect to your GitHub repo
3. Use the settings from `render.yaml`
4. Set environment variables:
   - `DATABASE_URL` - Supabase PostgreSQL connection string
   - `GOOGLE_CLIENT_ID` - From Google Cloud Console
   - `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
   - `S3_ENDPOINT` - Cloudflare R2 endpoint
   - `S3_BUCKET` - R2 bucket name
   - `S3_ACCESS_KEY_ID` - R2 API token ID
   - `S3_SECRET_ACCESS_KEY` - R2 API token secret
   - `S3_PUBLIC_BASE_URL` - Public CDN URL for assets
   - `PUBLIC_URL` - Your Render URL (e.g., https://my-corner.onrender.com)
   - `CORS_ORIGIN` - Same as PUBLIC_URL

### 4. Configure Google OAuth

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `https://your-domain.com/auth/google/callback`
   - `http://localhost:3000/auth/google/callback` (for dev)

### 5. Deploy

1. Push to your main branch
2. Render will automatically deploy
3. Check the health endpoint: `https://your-domain.com/health`

### 6. Custom Domain (Optional)

1. In Render, go to Settings → Custom Domains
2. Add your domain
3. Update DNS records as instructed
4. Update `PUBLIC_URL` and `CORS_ORIGIN` env vars
5. Update Google OAuth redirect URIs

---

## Post-Launch Checklist

- [ ] Test full flow: create → edit → publish → share
- [ ] Check Plausible analytics are working
- [ ] Monitor Render logs for errors
- [ ] Test on mobile devices
- [ ] Share with beta users

