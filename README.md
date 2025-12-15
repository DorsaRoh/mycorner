# my corner

A minimal "personal internet page" product. Create a blank canvas, add text, images, and links anywhere, publish it, and share via URL. Others can view and fork your page to make their own.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 + React 18 |
| Language | TypeScript |
| Data | GraphQL (Apollo Client + Server) |
| Database | PostgreSQL (prod) / SQLite (dev) |
| ORM | Drizzle ORM |
| Storage | Supabase Storage (prod) / Local disk (dev) |
| Server | Node.js + Express |
| Auth | Passport.js + Google OAuth |
| Hosting | Render |

## Production Deployment

### Prerequisites

1. **Supabase Account** - For database and file storage
2. **Render Account** - For hosting
3. **Google Cloud Console** - For OAuth credentials

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and service role key (Settings → API)
3. Create a storage bucket named `uploads` and set it to public

### Step 2: Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URIs:
   - `https://your-app.onrender.com/auth/google/callback`
   - `http://localhost:3000/auth/google/callback` (for dev)

### Step 3: Deploy to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repository
4. Configure environment variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | PostgreSQL connection string from Supabase |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `SESSION_SECRET` | (Render generates this) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | `uploads` |
| `PUBLIC_URL` | Your Render app URL |
| `CORS_ORIGIN` | Same as PUBLIC_URL |

5. Deploy! The database schema will be applied automatically.

### Step 4: Custom Domain (Optional)

1. In Render → Settings → Custom Domains, add your domain
2. Update DNS as instructed
3. Update `PUBLIC_URL`, `CORS_ORIGIN`, and Google OAuth redirect URIs

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

See `.env.example` for all available options.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript compiler check |
| `npm run db:generate` | Generate database migrations |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Drizzle Studio |

## Project Structure

```
src/
├── components/
│   ├── editor/           # Page editor components
│   │   ├── Editor.tsx    # Main editor orchestration
│   │   ├── Canvas.tsx    # Draggable block canvas
│   │   ├── Block.tsx     # Individual block (text/image/link)
│   │   └── ...
│   └── viewer/           # Public page viewer
│       ├── ViewerCanvas.tsx
│       ├── ViewerBlock.tsx
│       └── FloatingAction.tsx
├── lib/
│   ├── apollo/           # Apollo Client setup (SSR)
│   ├── config.ts         # Typed environment config
│   ├── graphql/          # Queries and mutations
│   ├── hooks/            # Custom hooks (autosave)
│   └── upload.ts         # Client-side upload utility
├── pages/
│   ├── index.tsx         # Home - create new page
│   ├── edit/[id].tsx     # Editor route
│   ├── p/[id].tsx        # Public viewer (by ID)
│   └── u/[username].tsx  # Public viewer (by username)
├── server/
│   ├── index.ts          # Express + Next.js server
│   ├── auth/             # Passport Google OAuth
│   ├── db/               # Database (SQLite/PostgreSQL)
│   ├── graphql/          # Apollo Server + resolvers
│   ├── rateLimit.ts      # Rate limiting middleware
│   ├── storage.ts        # File storage (local/Supabase)
│   └── upload.ts         # Upload endpoint
├── shared/
│   └── types/            # Shared TypeScript types
└── styles/               # CSS modules

docs/
├── ARCHITECTURE.md       # System architecture
└── SHIP_CHECKLIST.md     # Production checklist
```

## Routes

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `/` | Create new page | No |
| `/edit/[id]` | Edit page (draft or server) | Owner only |
| `/p/[id]` | View published page by ID | No |
| `/u/[username]` | View published page by username | No |
| `/graphql` | GraphQL endpoint | No |
| `/auth/google` | Google OAuth login | No |
| `/auth/google/callback` | OAuth callback | No |
| `/api/assets/upload` | Upload files | No |
| `/health` | Health check | No |

## Core Features

### 1. Page Editor (`/edit/[id]`)

- **Add blocks**: Click + buttons or double-click canvas
- **Drag blocks**: Click and drag anywhere on a block
- **Resize blocks**: Drag the corner handle when selected
- **Style blocks**: Use the toolbar for text styling, effects
- **Autosave**: Changes save automatically after 1 second
- **Publish**: Click "Publish" to make page public

### 2. Public Viewer (`/p/[id]` or `/u/[username]`)

- **Server-side rendered** for fast loading + SEO
- **Read-only** view of published pages
- **Share button**: Copy URL to clipboard
- **Fork button**: "Make your own" creates editable copy

### 3. Authentication

Uses **Google OAuth** for authentication:

1. Click "Publish" on your page
2. Sign in with Google
3. **First time**: Choose your username and page title
4. Your page is published at `/u/{username}`

## Security Features

- **Rate limiting** on all API endpoints
- **Zod validation** for all user inputs
- **Reserved usernames** (admin, api, etc.)
- **Owner-only** page modifications
- **Secure sessions** (httpOnly, secure cookies in prod)
- **CORS** protection in production

## Analytics

Privacy-respecting analytics via [Plausible](https://plausible.io):

1. Sign up at plausible.io
2. Add your domain
3. Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` env var

No cookies, no personal data collected.

## Common Issues

### "Page not found" when editing
- Check if you own the page
- Try signing in with Google

### Publish fails
- You must be signed in to publish
- Check console for errors

### Changes not saving
- Check browser console for errors
- Look for "Saved" indicator
- Check network tab for 413 errors (content too large)

### Images not uploading
- Check file size (max 15MB)
- Check file type (PNG, JPG, WebP, GIF only)
- In production, check Supabase storage configuration

## Local Development

### Without Google OAuth

You can run the app without OAuth configured - you just won't be able to publish:

```bash
npm run dev
```

### With SQLite (default in dev)

Development uses SQLite by default. Data is stored in `./data/my-corner.db`.

### With PostgreSQL locally

Set `DATABASE_URL` in `.env` and unset `USE_SQLITE`:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/mycorner
```

## License

Private - All rights reserved
