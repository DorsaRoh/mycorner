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
| Database | SQLite (better-sqlite3) |
| Server | Node.js + Express |
| Auth | Passport.js + Google OAuth |

## Project Structure

```
src/
├── components/
│   ├── editor/           # Page editor components
│   │   ├── Editor.tsx    # Main editor orchestration
│   │   ├── Canvas.tsx    # Draggable block canvas
│   │   ├── Block.tsx     # Individual block (text/image/link)
│   │   ├── Toolbar.tsx   # Add blocks, publish, share
│   │   └── ShareModal.tsx
│   └── viewer/           # Public page viewer
│       ├── ViewerCanvas.tsx
│       ├── ViewerBlock.tsx
│       ├── FloatingAction.tsx
│       └── FeedbackModal.tsx
├── lib/
│   ├── apollo/           # Apollo Client setup (SSR)
│   ├── graphql/          # Queries and mutations
│   ├── hooks/            # Custom hooks (autosave)
│   └── upload.ts         # Client-side upload utility
├── pages/
│   ├── index.tsx         # Home - create new page
│   ├── edit/[id].tsx     # Editor route
│   └── p/[id].tsx        # Public viewer route
├── server/
│   ├── index.ts          # Express + Next.js server
│   ├── auth/             # Passport magic link auth
│   ├── graphql/          # Apollo Server + resolvers
│   └── upload.ts         # Asset upload endpoint
├── shared/
│   └── types/            # Shared TypeScript types
└── styles/               # CSS modules
public/
└── uploads/              # Uploaded assets (images, audio)
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript compiler check |

## Core Features

### 1. Page Editor (`/edit/[id]`)

- **Add blocks**: Double-click canvas (text) or use toolbar buttons
- **Drag blocks**: Click and drag anywhere on a block
- **Resize blocks**: Drag the corner handle when selected
- **Delete blocks**: Click × button or press Delete key
- **Autosave**: Changes save automatically after 1 second
- **Publish**: Click "Publish" to make page public

### 2. Public Viewer (`/p/[id]`)

- **Server-side rendered** for fast loading
- **Read-only** view of published pages
- **Fork button**: "Make your own" creates editable copy
- **Feedback**: Visitors can send messages to creators

### 3. Authentication

Uses **Google OAuth** for authentication:

1. Click "Publish" on your page
2. Click "Continue with Google" in the auth modal
3. Sign in with your Google account
4. **First time only**: Choose your username and page title
5. Your page is automatically published at `/u/{username}`

**Setup**: See "Setting up Google OAuth" below for configuration.

## Routes

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `/` | Home page - landing | No |
| `/new` | Create/edit a new page (draft mode) | No |
| `/edit/[id]` | Edit an existing page | Owner only |
| `/p/[id]` | View published page by ID | No |
| `/u/[username]` | View published page by username | No |
| `/graphql` | GraphQL endpoint | No |
| `/auth/google` | Google OAuth login | No |
| `/auth/google/callback` | Google OAuth callback | No |
| `/auth/status` | Get current auth status | No |
| `/api/me` | Get current user profile | No |
| `/api/onboarding` | Set username + create page | Yes |
| `/api/publish` | Publish a page | Yes |
| `/api/assets/upload` | Upload images/audio | No |
| `/uploads/*` | Serve uploaded assets | No |

## GraphQL API

### Queries

```graphql
# Get current user
query { me { id email } }

# Get page (owner or published)
query { page(id: "page_1") { id title blocks { ... } } }

# Get public page only
query { publicPage(id: "page_1") { id title blocks { ... } } }
```

### Mutations

```graphql
# Create new page
mutation { createPage(input: { title: "My Page" }) { id } }

# Update page
mutation { updatePage(id: "page_1", input: { title: "New Title", blocks: [...] }) { id } }

# Publish page (auth required)
mutation { publishPage(id: "page_1") { id isPublished } }

# Fork page (auth required)
mutation { forkPage(id: "page_1") { id } }

# Request magic link
mutation { requestMagicLink(email: "you@example.com") { success } }

# Send feedback
mutation { sendFeedback(pageId: "page_1", message: "Great page!") { success } }
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

```env
# Server
PORT=3000
NODE_ENV=development

# Session secret (change in production!)
# Generate with: openssl rand -base64 32
SESSION_SECRET=your-session-secret-at-least-32-characters-long

# Google OAuth (required for authentication)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Database (optional - defaults to ./data/my-corner.db)
# DATABASE_PATH=/path/to/your/database.db

# CORS origin (production only)
# CORS_ORIGIN=https://yourdomain.com
```

### Setting up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Go to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Choose "Web application"
6. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
7. Copy Client ID and Client Secret to `.env.local`

## Asset Uploads

Images and audio files are uploaded to the server before being saved in page data. This keeps the page JSON small and fast.

### How it works

1. User drops/pastes/selects an image or audio file
2. Client uploads file to `POST /api/assets/upload` (multipart/form-data)
3. Server validates, stores file in `/public/uploads/`, returns URL
4. Client stores only the URL in the block/page data

### Upload endpoint

```
POST /api/assets/upload
Content-Type: multipart/form-data

file: <binary file data>
```

Response:
```json
{
  "url": "/uploads/1702567890123-abc123.png",
  "mime": "image/png",
  "size": 245678,
  "originalName": "my_image.png"
}
```

### File limits

| Type | Max Size | Allowed Formats |
|------|----------|-----------------|
| Images | 15 MB | PNG, JPG, WebP, GIF |
| Audio | 25 MB | MP3, WAV, OGG, AAC, M4A |

### File storage

- **Development**: Files stored in `/public/uploads/` and served via `/uploads/*`
- **Production (S3 migration)**: Update `src/server/upload.ts`:
  1. Replace `multer.diskStorage` with `multer-s3`
  2. Return full S3 URL instead of local path
  3. Set appropriate bucket policies for public read access

## Data Storage

Uses **SQLite** with `better-sqlite3` for persistent storage. Database file is stored at `./data/my-corner.db` by default.

### Database Schema

**Users table:**
- `id` (uuid primary key)
- `email` (unique, not null)
- `google_sub` (unique, not null) - stable Google account ID
- `name` (from Google profile)
- `avatar_url` (from Google profile)
- `username` (unique) - chosen during onboarding
- `created_at`, `updated_at` timestamps

**Pages table:**
- `id` (primary key)
- `user_id` (foreign key to users)
- `owner_id` (for anonymous session tracking)
- `title`, `slug` (unique)
- `content` (JSON blocks array)
- `background` (JSON config)
- `is_published` (boolean)
- `server_revision`, `schema_version`
- `created_at`, `updated_at` timestamps

For production, you can switch to PostgreSQL by updating `src/server/db/index.ts`.

## Security Notes

- Unpublished pages are only accessible to their owner
- Publishing requires authentication
- Forking requires authentication
- Session cookies are httpOnly and secure in production
- CORS is restricted in production

## User Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Create    │────▶│    Edit     │────▶│   Publish   │
│    Page     │     │   (draft)   │     │   (auth)    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Fork     │◀────│    View     │◀────│    Share    │
│   (auth)    │     │  (public)   │     │    URL      │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Development Tips

### Testing the full flow

1. Go to `http://localhost:3000`
2. Click "Create your page"
3. Add some blocks, edit content
4. Click "Publish"
5. Sign in with Google
6. **First time**: Choose your username and page title
7. Share modal appears with public URL (`/u/{username}`)
8. Open public URL in incognito
9. Click "Make your own" to test forking

### GraphQL Playground

Visit `http://localhost:3000/graphql` to explore the API interactively.

### Viewing feedback

Feedback is logged to the console in development:

```
💬 New feedback for page page_1:
   Message: This is great!
   Email: viewer@example.com
```

## Troubleshooting

### "Page not found" when editing
- The page may not exist or you don't own it
- Check if you're authenticated

### Publish fails
- You need to be authenticated
- Check console for magic link
- Click the link to sign in, then try again

### Changes not saving
- Check browser console for errors
- Ensure server is running
- Look for "Saved" indicator in toolbar

## License

Private - All rights reserved
