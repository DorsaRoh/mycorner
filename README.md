# My Corner: A Complete Web Development Curriculum

> **This README is not documentation—it is a guided curriculum.**  
> By the end, you will understand how the modern web works, how to build production applications, and how to confidently modify, debug, extend, and deploy this system.

---

## 0. How to Read This README

This document is **long by design**. It teaches you everything about web development from absolute zero, using this real production codebase as the foundation. Every concept is grounded in actual code you can inspect.

### Reading Strategy

1. **Read sequentially the first time.** Later sections build on earlier ones.
2. **Open the referenced files** in your editor as you read.
3. **Don't skip sections** even if you think you know them—the explanations are specific to this codebase.
4. **Take breaks.** This is a multi-hour curriculum.

### What You'll Learn

- What "the web" actually is and how browsers talk to servers
- How this application works from end to end
- Frontend development: HTML, CSS, JavaScript, React, Next.js
- Backend development: servers, APIs, databases, authentication
- Deployment: how code goes from your laptop to the internet

### Prerequisites

You need:
- A computer with a terminal/command line
- A text editor (VS Code recommended)
- Node.js installed (version 18 or higher)

You do NOT need:
- Any prior programming knowledge
- Any understanding of "the web"

---

## 1. What "The Web" Actually Is

Before we look at code, you need to understand what happens when someone visits a website. Let's trace what happens when a user types `itsmycorner.com/hii` into their browser.

### The Journey of a Request

```
┌─────────────┐    ①     ┌─────────────┐    ②     ┌─────────────┐
│   Browser   │ ───────> │     DNS     │ ───────> │   Server    │
│ (Chrome,    │          │ (Domain →   │          │ (This app!) │
│  Safari)    │ <─────── │   IP addr)  │ <─────── │             │
└─────────────┘    ⑤     └─────────────┘    ③④    └─────────────┘
     │                                                   │
     └───────────────────────────────────────────────────┘
```

**Step by step:**

1. **You type a URL.** The browser needs to find where `itsmycorner.com` lives on the internet.

2. **DNS lookup.** DNS (Domain Name System) is like a phone book for the internet. It converts `itsmycorner.com` into an IP address like `149.248.223.45`—the actual location of the server.

3. **HTTP Request.** The browser sends a message called an "HTTP request" to that IP address. This message says: "Please give me the page at `/hii`."

4. **Server processing.** Our server (this codebase!) receives the request, figures out what `/hii` means, gets the right data, and builds a response.

5. **HTTP Response.** The server sends back HTML, CSS, and JavaScript—the ingredients that tell the browser what to display.

6. **Rendering.** The browser takes those ingredients and paints pixels on your screen.

### What Is a "Server"?

A **server** is just a computer that's always on and always connected to the internet, waiting for requests. When we say "server," we mean two things:

1. **The physical/virtual computer** running somewhere (like a data center)
2. **The program running on that computer** that knows how to respond to requests

This codebase is the program. When you run it, your laptop becomes a server (temporarily).

### Where Does This Happen in Our Code?

Look at `src/server/index.ts`:

```typescript
import express from 'express';
import next from 'next';

// ... setup code ...

const server = express();

// This is the heart: "For ANY request, let Next.js handle it"
server.all('*', (req, res) => {
  return handle(req, res);
});

server.listen(port, () => {
  console.log(`🚀 Server ready at http://localhost:${port}`);
});
```

This code says: "Listen on a port. When any request comes in, handle it." That's literally what a server is—a program that listens and responds.

### What Are HTML, CSS, and JavaScript?

These three technologies are the foundation of every website:

| Technology | Purpose | Analogy |
|------------|---------|---------|
| **HTML** | Structure and content | The skeleton and organs of a body |
| **CSS** | Appearance and layout | The skin, clothes, and makeup |
| **JavaScript** | Interactivity and logic | The muscles and brain |

You'll see all three in this codebase, but in modernized forms:
- HTML → **JSX** (HTML-like syntax in JavaScript)
- CSS → **CSS Modules** (scoped CSS per component)
- JavaScript → **TypeScript** (JavaScript with type checking)

---

## 2. What This Project Is

**My Corner** is a web application that lets anyone create a simple personal webpage—their "corner of the internet." Think of it like a digital business card or a simple bio page.

### Core Concepts

#### What Is a "Corner"?

A corner is a single-page website that a user creates. It contains:
- **Blocks**: Text, images, or links that the user places on a canvas
- **Background**: A color, gradient, or image behind everything
- **A public URL**: Like `itsmycorner.com/username`

#### Draft vs. Published

This distinction is fundamental to understanding the application:

| State | Where it lives | Who can see it | Persistence |
|-------|---------------|----------------|-------------|
| **Draft** | Browser's localStorage | Only the author | Survives browser refresh, not device changes |
| **Published** | Server database | Anyone with the URL | Permanent until updated |

When you use the editor at `/new`, your changes are saved as a **draft** in your browser. When you click "Publish," the content is sent to the server and becomes **published**—visible to the world.

#### Public vs. Private

- **Public pages**: Visible at `/{username}`. Anyone can view them.
- **Private data**: Emails, authentication tokens, unpublished drafts. Only the owner (and the server) can access these.

#### Author vs. Non-Author

When viewing a published page:
- **Author**: Sees their own page, can go to `/edit` to modify it
- **Non-Author**: Sees the page, sees a "Make your own" button to start their own

### Why Is the Architecture Shaped This Way?

The architecture supports a "viral loop":

```
New user arrives → Sees someone's page → Clicks "Make your own" 
    → Creates page anonymously → Publishes → Signs in → Gets URL
```

This flow explains why:
1. **Anonymous editing exists**: Users can start creating before signing in (reduces friction)
2. **Draft storage is client-side**: No server account needed to experiment
3. **Auth is only required at publish**: The "paywall" is at the moment of value

---

## 3. Repository Map

Let's walk through every folder and file, explaining why it exists.

### Root Directory

```
mycorner/
├── src/                    # All source code
├── public/                 # Static files served directly
├── data/                   # SQLite database (development only)
├── dist/                   # Compiled server code (generated)
├── node_modules/           # Dependencies (generated)
├── docs/                   # Internal documentation
├── scripts/                # Utility scripts
├── package.json            # Project configuration
├── tsconfig.json           # TypeScript configuration
├── next.config.js          # Next.js configuration
├── drizzle.config.ts       # Database ORM configuration
├── Dockerfile              # Container definition for deployment
├── fly.toml                # Fly.io deployment configuration
└── README.md               # This file!
```

### package.json

This file is the "birth certificate" of a JavaScript project. Open `package.json`:

```json
{
  "name": "my-corner",
  "scripts": {
    "dev": "...",        // Start development server
    "build": "...",      // Compile for production
    "start": "..."       // Run production server
  },
  "dependencies": {       // Libraries we use in production
    "next": "14.0.4",
    "react": "^18.2.0",
    "express": "^4.18.2"
  },
  "devDependencies": {    // Libraries only for development
    "typescript": "^5.3.3"
  }
}
```

Key dependencies and what they do:

| Package | Purpose |
|---------|---------|
| `next` | React framework with routing, SSR, and build tooling |
| `react` | UI component library |
| `express` | HTTP server framework |
| `drizzle-orm` | Database ORM (Object-Relational Mapping) |
| `passport` | Authentication middleware |
| `zod` | Schema validation |

### The `src/` Directory

This is where all the application code lives:

```
src/
├── pages/              # Routes (URLs) - Next.js Pages Router
├── components/         # Reusable UI pieces
├── lib/                # Shared utilities and logic
├── server/             # Backend-only code
├── shared/             # Code used by both frontend and backend
├── styles/             # Global CSS
└── middleware.ts       # Request middleware
```

### src/pages/ — The Routing System

In Next.js, **files in `pages/` become URLs**. This is called "file-based routing."

```
src/pages/
├── index.tsx           # / (landing page)
├── new.tsx             # /new (anonymous editor)
├── edit/
│   └── index.tsx       # /edit (authenticated editor)
├── [slug].tsx          # /{anything} (dynamic - public pages)
├── 404.tsx             # 404 error page
├── 500.tsx             # 500 error page
├── _app.tsx            # App wrapper (applied to all pages)
├── _document.tsx       # HTML document structure
└── api/                # API routes (backend endpoints)
    ├── me.ts           # /api/me
    ├── publish.ts      # /api/publish
    ├── upload.ts       # /api/upload
    └── auth/           # Authentication endpoints
```

**Key insight**: The file `[slug].tsx` has brackets around `slug`. This makes it a **dynamic route**—it matches any URL like `/alice`, `/bob`, `/your-username`.

### src/components/ — UI Building Blocks

Components are reusable pieces of UI. They're organized by feature:

```
src/components/
├── editor/             # The page editor
│   ├── Editor.tsx      # Main editor component
│   ├── Canvas.tsx      # The drawing canvas
│   ├── Block.tsx       # Individual content blocks
│   ├── AuthGate.tsx    # Login modal
│   └── *.module.css    # Scoped styles for each component
├── viewer/             # Public page display
│   ├── PublicPageView.tsx
│   ├── ViewerCanvas.tsx
│   └── ViewerBlock.tsx
└── platform/           # Shared UI primitives
    ├── UiButton.tsx
    └── UiModal.tsx
```

### src/server/ — Backend Code

This code runs ONLY on the server, never in the browser:

```
src/server/
├── index.ts            # Server entry point
├── db/                 # Database operations
│   ├── schema.ts       # Table definitions
│   ├── postgres.ts     # PostgreSQL adapter (production)
│   ├── sqlite.ts       # SQLite adapter (development)
│   └── index.ts        # Facade that picks the right adapter
├── auth/               # Authentication
│   ├── passport.ts     # Google OAuth configuration
│   ├── routes.ts       # /auth/* endpoints
│   └── session.ts      # Session/cookie management
├── graphql/            # GraphQL API
│   ├── schema.ts       # Type definitions
│   └── resolvers.ts    # Query/mutation handlers
└── storage/            # File uploads
    └── client.ts       # S3/R2 storage client
```

### src/lib/ — Shared Utilities

Code that's used across the application:

```
src/lib/
├── config.ts           # Environment variable handling
├── routes.ts           # URL building helpers
├── themes.ts           # Theme definitions
├── schema/
│   └── page.ts         # Page document schema (Zod)
├── canvas/
│   └── coordinates.ts  # Canvas math utilities
├── draft/
│   └── storage.ts      # LocalStorage draft persistence
└── upload.ts           # Client-side upload logic
```

---

## 4. Frontend Fundamentals

Let's learn how the UI is built, using real code from this project.

### HTML → JSX

Traditional HTML:
```html
<div class="container">
  <h1>Hello</h1>
  <button onclick="handleClick()">Click me</button>
</div>
```

JSX (what we use):
```jsx
<div className="container">
  <h1>Hello</h1>
  <button onClick={handleClick}>Click me</button>
</div>
```

Key differences:
- `class` → `className` (because `class` is a reserved word in JavaScript)
- `onclick` → `onClick` (camelCase for all event handlers)
- `{handleClick}` → JavaScript expressions go in curly braces

**Real example from** `src/pages/index.tsx`:

```typescript
export default function Home() {
  const router = useRouter();

  const handleCTAClick = () => {
    router.push('/new');
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>your corner of the internet</h1>
      <button className={styles.cta} onClick={handleCTAClick}>
        make your own corner
      </button>
    </main>
  );
}
```

This is a **React component**—a function that returns JSX describing what to display.

### CSS → CSS Modules

Instead of one global CSS file where styles can conflict, we use **CSS Modules**—each component gets its own scoped stylesheet.

**File**: `src/styles/Landing.module.css`
```css
.main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.title {
  font-size: 2.5rem;
  color: #1a1a2e;
}

.cta {
  padding: 16px 32px;
  background: #6366f1;
  border-radius: 12px;
}
```

**Usage in component:**
```typescript
import styles from '@/styles/Landing.module.css';

// styles.main becomes a unique class like "Landing_main__x7y2z"
<main className={styles.main}>
```

The module system automatically generates unique class names, preventing conflicts.

### State — How the Editor Remembers Things

**State** is data that changes over time and triggers UI updates when it changes.

**Example from** `src/components/editor/Editor.tsx`:

```typescript
// useState is a React "hook" that creates state
const [blocks, setBlocks] = useState<BlockType[]>(initialBlocks);
const [selectedId, setSelectedId] = useState<string | null>(null);
const [publishing, setPublishing] = useState(false);
```

- `blocks` is the current value
- `setBlocks` is a function to update it
- When you call `setBlocks([...newBlocks])`, React re-renders the component

The editor maintains state for:
- **blocks**: All content on the canvas
- **selectedId**: Which block is currently selected
- **background**: The background configuration
- **publishing**: Whether we're currently publishing
- **isPublished**: Whether the page has been published

### Rendering — Where Code Runs

In Next.js, code can run in two places:

| Environment | When | Access to |
|-------------|------|-----------|
| **Server** | At request time or build time | Database, file system, secrets |
| **Client** | In user's browser | DOM, localStorage, user events |

**Server rendering** (`getStaticProps`, `getServerSideProps`):
```typescript
// This runs on the server, not in the browser
export const getStaticProps = async (context) => {
  // We can access the database here
  const pageData = await getPublishedPageBySlug(slug);
  
  // We return data that gets passed to the component
  return {
    props: { doc: pageData.doc, slug },
    revalidate: 60, // Re-generate every 60 seconds
  };
};
```

**Client rendering** (regular React components):
```typescript
// This runs in the browser
useEffect(() => {
  // Access localStorage (browser-only API)
  const draft = localStorage.getItem('yourcorner:draft:v1');
}, []);
```

---

## 5. Backend Fundamentals

### What "Server" Means in This Project

Our server setup is unique: we combine Express (a Node.js server framework) with Next.js (a React framework). Look at `src/server/index.ts`:

```typescript
import express from 'express';
import next from 'next';

const app = next({ dev });           // Create Next.js instance
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();               // Initialize Next.js
  
  const server = express();          // Create Express server
  
  // Add middleware layers
  server.use(session({ ... }));      // Session handling
  server.use(passport.initialize()); // Authentication
  
  // Mount route handlers
  server.use('/auth', authRoutes);   // Auth endpoints
  server.use('/api', apiRouter);     // API endpoints
  server.use('/graphql', ...);       // GraphQL endpoint
  
  // Everything else goes to Next.js
  server.all('*', (req, res) => handle(req, res));
  
  server.listen(port);
}
```

### Request Flow Diagram

When a request arrives:

```
Request: GET /hii
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│                        Express Server                         │
├──────────────────────────────────────────────────────────────┤
│  1. session() middleware - Loads/creates session cookie       │
│  2. passport.initialize() - Sets up auth checking             │
│  3. Route matching:                                           │
│     - /auth/*    → authRoutes (login/logout)                 │
│     - /api/*     → apiRouter (REST endpoints)                │
│     - /graphql   → Apollo Server                             │
│     - Everything else → Next.js                              │
└──────────────────────────────────────────────────────────────┘
    │
    │ (Route: /hii doesn't match /auth, /api, /graphql)
    ▼
┌──────────────────────────────────────────────────────────────┐
│                         Next.js                               │
├──────────────────────────────────────────────────────────────┤
│  1. Matches /hii to [slug].tsx (dynamic route)               │
│  2. Runs getStaticProps:                                      │
│     - Calls getPublishedPageBySlug('hii')                    │
│     - Queries database for page data                          │
│  3. Renders React component with data                         │
│  4. Returns HTML response                                     │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
Response: HTML page with content
```

### API Routes — How the Frontend Talks to the Backend

API routes are functions that handle specific HTTP endpoints. They live in `src/pages/api/`.

**Example**: `src/pages/api/me.ts`

```typescript
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // This runs on the server, not in the browser
  
  if (!req.isAuthenticated() || !req.user) {
    return res.json({
      authenticated: false,
      user: null,
    });
  }

  return res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
    },
  });
}
```

The frontend calls this with:
```typescript
const response = await fetch('/api/me');
const data = await response.json();
// data = { authenticated: true, user: { id: "...", ... } }
```

### Concrete Flow: Publishing a Page

Let's trace what happens when a user clicks "Publish":

**1. Client initiates publish** (`src/components/editor/Editor.tsx`):
```typescript
const handlePublish = async () => {
  setPublishing(true);
  
  const response = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc: pageDocument }),
  });
  
  const result = await response.json();
  // Redirect to the public URL
  router.push(result.url);
};
```

**2. Server receives request** (`src/pages/api/publish.ts`):
```typescript
export default async function handler(req, res) {
  // Verify user is authenticated
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Validate the document
  const parseResult = PublishRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid document' });
  }
  
  // Render static HTML
  const html = renderPageHtml(doc);
  
  // Upload to storage (S3/R2)
  await uploadPageHtml(slug, html);
  
  // Save to database
  await db.publishPage({
    id: pageId,
    content: JSON.stringify(doc),
    slug: user.username,
  });
  
  // Trigger cache refresh
  await res.revalidate(`/${slug}`);
  
  return res.json({ success: true, url: `/${slug}` });
}
```

**3. Database is updated** (`src/server/db/postgres.ts`):
```typescript
export async function publishPage(params) {
  await d.update(schema.pages)
    .set({
      publishedContent: contentJson,
      publishedAt: new Date(),
      isPublished: true,
      slug: slug,
    })
    .where(eq(schema.pages.id, id));
}
```

**4. User is redirected** to their published page at `/{username}`.

---

## 6. Routing (Deep Dive)

### How URLs Map to Files

```
URL                    File                        Component
─────────────────────────────────────────────────────────────
/                  →  src/pages/index.tsx       →  Home
/new               →  src/pages/new.tsx         →  NewPage
/edit              →  src/pages/edit/index.tsx  →  EditPage
/alice             →  src/pages/[slug].tsx      →  PublicPage
/bob               →  src/pages/[slug].tsx      →  PublicPage
/api/me            →  src/pages/api/me.ts       →  API handler
/api/publish       →  src/pages/api/publish.ts  →  API handler
```

### Dynamic Routes Explained

The file `src/pages/[slug].tsx` uses **brackets** to indicate a dynamic segment:

```typescript
// [slug].tsx matches ANY path like /alice, /bob, /xyz
export const getStaticProps = async (context) => {
  // context.params.slug = "alice" for /alice
  const { slug } = context.params as { slug: string };
  
  const pageData = await getPublishedPageBySlug(slug);
  return { props: { doc: pageData?.doc, slug } };
};
```

### What Happens on Page Refresh

When you refresh a page, the entire request cycle starts over:

1. **Browser discards current state** (React components are destroyed)
2. **Fresh HTTP request** goes to the server
3. **Server runs `getStaticProps`** (or returns cached version)
4. **New HTML is sent** to the browser
5. **React "hydrates"** (re-attaches interactivity to the HTML)

### Why Blank Pages Happen

Common causes and solutions:

| Symptom | Cause | Solution |
|---------|-------|----------|
| Page is blank | `getStaticProps` returned null data | Check database query |
| Page shows "Loading..." forever | Client-side fetch failed | Check `/api/` endpoint |
| Page works locally, blank in prod | Database not accessible | Check DATABASE_URL env var |
| Page shows old content | Cache not invalidated | Call `res.revalidate()` |

### Route Debugging Checklist

```
1. Is the file in the right location?
   └── /edit → src/pages/edit/index.tsx (NOT src/pages/edit.tsx)

2. Is the component exported as default?
   └── export default function EditPage() { ... }

3. Does getStaticProps return the right shape?
   └── return { props: { ... }, revalidate: 60 }

4. Is the data actually in the database?
   └── Check with: npm run db:studio
```

---

## 7. Database: Everything, No Hiding

### What Is a Database?

A **database** is organized storage for information that persists even when the server restarts. Think of it as a permanent filing cabinet that the server can read and write.

### Database Types in This Project

| Environment | Database | Location |
|-------------|----------|----------|
| **Development** | SQLite | `data/my-corner.db` (local file) |
| **Production** | PostgreSQL | Supabase cloud service |

The code automatically chooses based on environment—see `src/server/db/index.ts`:

```typescript
async function getAdapter() {
  if (process.env.NODE_ENV === 'production') {
    return await import('./postgres');
  } else {
    return await import('./sqlite');
  }
}
```

### Database Schema

The schema (structure) is defined in `src/server/db/schema.ts`:

#### Users Table

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  googleSub: text('google_sub').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  username: text('username').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

| Column | Type | Purpose | Sensitivity |
|--------|------|---------|-------------|
| `id` | UUID | Unique identifier | Internal only |
| `email` | text | User's email from Google | **SENSITIVE** - never expose publicly |
| `google_sub` | text | Google's unique account ID | **SENSITIVE** - auth identifier |
| `name` | text | Display name from Google | Semi-private |
| `avatar_url` | text | Profile picture URL | Public |
| `username` | text | Public identifier | **Public** - appears in URLs |
| `created_at` | timestamp | When account was created | Internal |
| `updated_at` | timestamp | Last modification time | Internal |

#### Pages Table

```typescript
export const pages = pgTable('pages', {
  id: text('id').primaryKey(),              // page_xxx format
  userId: uuid('user_id').references(() => users.id),
  ownerId: text('owner_id').notNull(),      // session ID or user ID
  title: text('title'),
  slug: text('slug').unique(),              // URL path (= username)
  content: jsonb('content').default([]),    // Draft blocks
  background: jsonb('background'),          // Draft background
  publishedContent: jsonb('published_content'),   // Snapshot at publish
  publishedBackground: jsonb('published_background'),
  publishedAt: timestamp('published_at'),
  publishedRevision: integer('published_revision'),
  isPublished: boolean('is_published').default(false),
  serverRevision: integer('server_revision').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Critical distinction:**

| Column | Purpose |
|--------|---------|
| `content` | Current draft (what the editor shows) |
| `publishedContent` | Snapshot at publish time (what the public sees) |

This separation allows users to edit without affecting their live page until they publish again.

#### Feedback Tables

```typescript
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: text('page_id').notNull().references(() => pages.id),
  message: text('message').notNull(),
  email: text('email'),           // Optional, for response
  createdAt: timestamp('created_at').defaultNow(),
});

export const productFeedback = pgTable('product_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  message: text('message').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### Data Flow Diagram

```
User Action                      Database Effect
───────────────────────────────────────────────────────────────
Signs in with Google     →  Upsert to `users` table
                            (creates or updates based on google_sub)

Edits page (draft mode)  →  Nothing (stored in localStorage)

Saves page (edit mode)   →  Updates `content` and `background` in `pages`
                            Increments `server_revision`

Publishes page          →  Copies `content` → `publishedContent`
                           Copies `background` → `publishedBackground`
                           Sets `isPublished = true`
                           Sets `slug` = username
                           Sets `publishedAt` = now
                           Increments `publishedRevision`

Viewer loads /{slug}    →  Reads `publishedContent` from `pages`
                           (NOT `content` - that's the draft)
```

---

## 8. How to Inspect All Data

### Using Drizzle Studio (Recommended)

Drizzle Studio is a visual database browser. Run:

```bash
# For local SQLite database
npm run db:studio:local

# For production PostgreSQL (requires .env.prod)
npm run db:studio
```

This opens a web interface where you can browse tables, run queries, and inspect data.

### SQL Queries (Read-Only Examples)

**View all users:**
```sql
SELECT id, email, username, created_at 
FROM users
ORDER BY created_at DESC;
```

**View published pages:**
```sql
SELECT id, slug, title, is_published, published_at 
FROM pages
WHERE is_published = true;
```

**Find a specific user's pages:**
```sql
SELECT p.id, p.slug, p.is_published, u.username, u.email
FROM pages p
JOIN users u ON p.user_id = u.id
WHERE u.username = 'someuser';
```

**Debug a missing page:**
```sql
-- Check if slug exists
SELECT * FROM pages WHERE slug = 'missing-page';

-- Check if it's published
SELECT is_published, published_at, published_content 
FROM pages WHERE slug = 'missing-page';
```

### Debugging a Blank Page

If a page at `/{username}` is blank:

1. **Check if the page exists:**
   ```sql
   SELECT id, slug, is_published FROM pages WHERE slug = 'username';
   ```

2. **Check if it's published:**
   ```sql
   SELECT is_published, published_at FROM pages WHERE slug = 'username';
   ```
   If `is_published = false`, the page won't show.

3. **Check if there's published content:**
   ```sql
   SELECT published_content FROM pages WHERE slug = 'username';
   ```
   If this is empty/null, the publish didn't save content properly.

4. **Check the user has a username:**
   ```sql
   SELECT username FROM users WHERE id = 'user-id';
   ```

### Viewing Storage (Uploaded Images)

**Local development**: Check `public/uploads/` folder

**Production (Supabase)**:
1. Go to your Supabase dashboard
2. Navigate to Storage
3. Open the `uploads` bucket

### Safety Rules

**NEVER run these in production:**
```sql
DELETE FROM users;           -- Deletes all users
UPDATE pages SET ...;        -- Mass update
DROP TABLE pages;            -- Destroys table
```

**ALWAYS:**
- Use `SELECT` first to preview what you'll affect
- Add `WHERE` clauses to limit scope
- Take backups before any modification
- Use transactions for multi-step changes

---

## 9. Authentication & Permissions

### What Is Authentication?

**Authentication** answers: "Who are you?"

When you log in with Google, we verify your identity through their OAuth system. The flow:

```
1. User clicks "Sign in with Google"
   ↓
2. Redirect to Google's login page
   ↓
3. User enters Google credentials (we never see these)
   ↓
4. Google redirects back with a code
   ↓
5. Our server exchanges code for user info
   ↓
6. We create/update user in our database
   ↓
7. We create a session cookie
```

### What Is Authorization?

**Authorization** answers: "What are you allowed to do?"

Examples in this app:
- Anyone can view published pages (no auth required)
- Only the owner can edit their page (auth required)
- Only authenticated users can publish (auth required)

### How Sessions Work

After logging in, the server creates a **session cookie**—a small piece of data stored in your browser that identifies you on subsequent requests.

See `src/server/auth/session.ts`:

```typescript
// Create a signed token containing user ID
function createSessionToken(payload: SessionPayload): string {
  const secret = getSessionSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}
```

The session contains:
- User ID
- Expiration timestamp

The signature ensures the cookie can't be forged—only our server (which knows the `SESSION_SECRET`) can create valid tokens.

### Public vs. Private Access

**Public (no authentication):**
- `GET /{slug}` - View any published page
- `GET /` - Landing page
- `GET /new` - Anonymous editor

**Private (authentication required):**
- `GET /edit` - Edit your page (redirects to /new if not authed)
- `POST /api/publish` - Publish a page
- `POST /api/save-page` - Save draft
- `GET /api/me` - Get current user info

### Why This Matters for Blank Pages

If authorization fails, the user might see a blank page or be redirected unexpectedly:

```typescript
// From src/pages/api/publish.ts
const user = await getUserFromRequest(req);
if (!user) {
  return res.status(401).json({ error: 'Authentication required' });
}
```

**Debugging auth issues:**
1. Check if the session cookie exists in browser DevTools
2. Check if `/api/me` returns a user
3. Check server logs for auth errors
4. Verify `SESSION_SECRET` is set correctly

---

## 10. Publishing Lifecycle

This is a critical flow to understand. Let's trace every step:

### Step 1: Editing (Draft Mode)

User is at `/new`, making changes:

```
Browser (localStorage)
├── blocks: [...block data...]
├── background: { mode: 'gradient', ... }
└── title: "My Page"
```

Every change triggers auto-save to localStorage:

```typescript
// From src/lib/draft/storage.ts
export function saveDraft(doc: PageDoc): void {
  const draft = { doc, updatedAt: Date.now() };
  localStorage.setItem('yourcorner:draft:v1', JSON.stringify(draft));
}
```

### Step 2: Publish Button Clicked

User clicks "Publish". If not authenticated:
1. Show auth modal
2. Redirect to Google OAuth
3. Return to `/new?publish=1`
4. Auto-continue to publish

### Step 3: Publish API Call

```typescript
// Client sends:
POST /api/publish
{
  "doc": {
    "version": 1,
    "blocks": [...],
    "background": {...}
  }
}
```

### Step 4: Server Processing

```typescript
// From src/pages/api/publish.ts

// 1. Validate user
const user = await getUserFromRequest(req);

// 2. Validate document
const parseResult = PublishRequestSchema.safeParse(req.body);

// 3. Render static HTML
const html = renderPageHtml(doc, { appOrigin });

// 4. Upload to storage (S3/R2)
await uploadPageHtml(slug, html);

// 5. Save to database
await db.publishPage({
  id: pageId,
  content: JSON.stringify(doc),
  slug: user.username,
});

// 6. Trigger cache refresh
await res.revalidate(`/${slug}`);

// 7. Return success
return res.json({ success: true, url: `/${slug}` });
```

### Step 5: ISR Revalidation

`res.revalidate()` tells Next.js: "The page at this path has changed. Regenerate it."

Next.js then:
1. Runs `getStaticProps` for that page
2. Fetches fresh data from database
3. Renders new HTML
4. Replaces cached version

### Step 6: Public View

When someone visits `/{username}`:

```typescript
// From src/pages/[slug].tsx
export const getStaticProps = async (context) => {
  const pageData = await getPublishedPageBySlug(slug);
  
  // Uses publishedContent, NOT content
  return {
    props: { doc: pageData.doc, slug },
    revalidate: 60,  // Re-check every 60 seconds
  };
};
```

### Owner vs. Visitor View

Both see the same page, but:
- **Owner**: Can navigate to `/edit` to modify
- **Visitor**: Sees "Make your own" CTA button

### Caching Strategy

```
Request for /{slug}
        │
        ▼
┌───────────────────────────────────────────┐
│  Is there a cached version?               │
│  (Generated by ISR)                       │
├───────────────────────────────────────────┤
│  YES → Return cached HTML immediately     │
│        (Background: check if stale)       │
│                                           │
│  NO  → Run getStaticProps                 │
│        → Query database                   │
│        → Render HTML                      │
│        → Cache it                         │
│        → Return to user                   │
└───────────────────────────────────────────┘
```

The `revalidate: 60` means: "After 60 seconds, the next request should trigger a background refresh."

---

## 11. UI vs. User Content

### Why This Distinction Matters

There are two types of content on every page:

| Type | Examples | Source |
|------|----------|--------|
| **Platform UI** | "Make your own" button, nav, modals | Our code (controlled) |
| **User Content** | Text blocks, images, links | User input (uncontrolled) |

### The Problem

Users might create content that clashes with platform UI:
- White text on a white background → CTA invisible
- Very dark background → Light UI elements disappear

### The Solution: Platform UI Tokens

We calculate appropriate colors based on the user's background:

```typescript
// From src/lib/platformUi.ts
export function getUiMode(background?: BackgroundConfig): 'light' | 'dark' | 'glass' {
  if (!background) return 'light';
  
  // Calculate perceived brightness of background
  const brightness = calculateBrightness(background);
  
  if (brightness > 0.7) return 'light';  // Light UI for dark backgrounds
  if (brightness < 0.3) return 'dark';   // Dark UI for light backgrounds
  return 'glass';                         // Semi-transparent for mid-tones
}
```

This ensures the "Make your own" button is always visible, regardless of what background the user chooses.

### Theme Variables

Themes are defined in `src/lib/themes.ts`:

```typescript
export const THEMES = {
  default: {
    id: 'default',
    name: 'Clean White',
    variables: {
      '--bg-primary': '#ffffff',
      '--text-primary': '#1a1a2e',
      '--accent-primary': '#6366f1',
      // ... more variables
    },
  },
  midnight: {
    // Dark theme
  },
  // ... more themes
};
```

These CSS variables are applied to the page container and cascade to all children.

---

## 12. Environment Variables & Secrets

### What Are Environment Variables?

Environment variables are configuration values that:
- Change between environments (development vs. production)
- Contain secrets that shouldn't be in code
- Are injected when the application starts

### Where They Live

| Environment | File | In Git? |
|-------------|------|---------|
| Local development | `.env.local` | **NO** - gitignored |
| Production secrets | Fly.io/Vercel dashboard | **NO** - never |
| Example/template | `.env.example` | Yes - for reference |

### Required Variables

From `src/lib/config.ts`:

```typescript
// Database
DATABASE_URL        // PostgreSQL connection string (required in prod)

// Authentication
GOOGLE_CLIENT_ID    // OAuth credentials
GOOGLE_CLIENT_SECRET
SESSION_SECRET      // For signing session cookies

// URLs
APP_ORIGIN          // https://www.itsmycorner.com
PUBLIC_URL          // Same as APP_ORIGIN

// Storage (Supabase or S3-compatible)
SUPABASE_URL
SUPABASE_SERVICE_KEY
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
```

### Which Ones Are Dangerous?

| Variable | Danger Level | If Leaked... |
|----------|--------------|--------------|
| `SESSION_SECRET` | 🔴 Critical | Attacker can forge sessions, become any user |
| `DATABASE_URL` | 🔴 Critical | Full database access |
| `GOOGLE_CLIENT_SECRET` | 🔴 Critical | Could be used in phishing attacks |
| `SUPABASE_SERVICE_KEY` | 🟠 High | Full storage access, can modify/delete files |
| `APP_ORIGIN` | 🟢 Low | Not a secret, just configuration |

### Creating a .env.local File

For local development:

```bash
# Database (not needed if using SQLite default)
# DATABASE_URL=postgresql://user:pass@localhost:5432/mycorner

# Auth (optional in dev - will show warning)
# GOOGLE_CLIENT_ID=xxx
# GOOGLE_CLIENT_SECRET=xxx

# Session (default provided in dev)
SESSION_SECRET=any-random-string-for-development

# URLs
   PUBLIC_URL=http://localhost:3000
   ```

---

## 13. Running Locally

### Prerequisites

1. **Node.js 18+**: Check with `node --version`
2. **npm** (comes with Node.js): Check with `npm --version`

### Step-by-Step Setup

**1. Install dependencies:**
   ```bash
cd mycorner
npm install
   ```

This reads `package.json` and downloads all required packages to `node_modules/`.

**2. Create environment file (optional):**
   ```bash
# Copy example if it exists, or create empty
touch .env.local
   ```

**3. Start development server:**
```bash
npm run dev:local
```

This runs:
- SQLite database (no PostgreSQL needed)
- Server on `http://localhost:3001`
- Hot reloading (changes appear instantly)

**4. Open in browser:**
```
http://localhost:3001
```

### What Happens When You Run `npm run dev`

```bash
npm run dev
```

This executes (from `package.json`):
```
node -r dotenv/config node_modules/.bin/ts-node \
  --project tsconfig.server.json \
  src/server/index.ts
```

Breaking it down:
1. `node` - Run JavaScript
2. `-r dotenv/config` - Load `.env.local` first
3. `ts-node` - Compile TypeScript on-the-fly
4. `src/server/index.ts` - The entry point

### Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `EADDRINUSE` | Port already in use | Change PORT or kill existing process |
| `Cannot find module` | Dependencies not installed | Run `npm install` |
| `DATABASE_URL required` | Missing env var in prod mode | Use `npm run dev:local` instead |
| `GOOGLE_CLIENT_ID required` | Auth not configured | Ignore warning or add credentials |

### Running Production Locally

To test the production build:

```bash
# 1. Build the application
npm run build

# 2. Start production server
npm run start
```

This simulates how the app runs in production (but still uses your local database).

---

## 14. Deployment

### What Is "Deployment"?

Deployment is the process of taking code from your laptop and running it on a server that's accessible to the world.

### The Build Process

```
Source Code                    Production Build
(src/*.ts, src/*.tsx)         (dist/*.js, .next/)
        │                              │
        │     npm run build            │
        └──────────────────────────────┘
```

`npm run build` does:
1. **TypeScript compilation**: `.ts` → `.js`
2. **Next.js optimization**: Bundles React, tree-shakes unused code
3. **Static generation**: Pre-renders pages with `getStaticProps`
4. **Output**: `dist/` (server) and `.next/` (Next.js)

### Deployment Platforms

This project is configured for **Fly.io** (see `fly.toml`), but could deploy anywhere that runs Node.js.

### What Happens on Deploy

```
1. Push code to Git
         │
         ▼
2. CI/CD picks up changes
         │
         ▼
3. Run: npm install
         │
         ▼
4. Run: npm run build
         │
         ▼
5. Create container image
   (using Dockerfile)
         │
         ▼
6. Deploy to servers
         │
         ▼
7. Start: npm run start
         │
         ▼
8. Server listens on port
         │
         ▼
9. Load balancer routes traffic
```

### Production Debugging

**Viewing logs:**
```bash
# Fly.io
fly logs

# Vercel
vercel logs
```

**Common production issues:**

| Symptom | Likely Cause | Debug Step |
|---------|--------------|------------|
| 500 errors | Uncaught exception | Check logs for stack trace |
| 503 errors | Server not running | Check if deploy succeeded |
| Slow pages | Database queries | Add timing logs |
| Missing styles | Build issue | Check if assets deployed |

### Caching in Production

```
Request → CDN Edge → Origin Server → Database
              │
              └── If cached: return immediately
                  If not: forward to origin
```

After publishing, we call `res.revalidate()` to clear the cache for that page.

---

## 15. Debugging Playbook

### Problem: Blank Published Page

**Symptom**: User visits `/{username}`, sees empty page or error.

**Diagnosis steps:**

1. **Check server logs** for errors during `getStaticProps`

2. **Verify page exists in database:**
   ```sql
   SELECT id, slug, is_published, published_content
   FROM pages WHERE slug = 'username';
   ```

3. **Check if published_content has data:**
   - If empty: Publish failed to save content
   - If has data: Rendering issue

4. **Check for hydration mismatch:**
   - Open browser DevTools Console
   - Look for "Hydration failed" errors

5. **Test the API directly:**
   ```bash
   curl http://localhost:3000/api/debug/published?slug=username
   ```

**Fix**: Usually one of:
- Re-publish the page
- Check that `publishPage` is correctly copying content to `publishedContent`
- Check for JavaScript errors in `PublicPageView`

### Problem: Auth Not Working

**Symptom**: User signs in, but still appears as anonymous.

**Diagnosis:**

1. **Check cookies in DevTools:**
   - Application tab → Cookies
   - Look for `yourcorner_session`

2. **Check `/api/me` response:**
   ```bash
   curl -b "yourcorner_session=..." http://localhost:3000/api/me
   ```

3. **Verify OAuth callback:**
   - Check server logs during sign-in
   - Look for "Google auth error" messages

4. **Check SESSION_SECRET:**
   - If changed, existing sessions become invalid

**Common fixes:**
- Clear cookies and sign in again
- Verify `SESSION_SECRET` matches across deploys
- Check Google OAuth redirect URI configuration

### Problem: Styles Missing in Production

**Symptom**: Looks fine locally, broken in production.

**Diagnosis:**

1. **Check if CSS files are loading:**
   - DevTools → Network → Filter by CSS
   - Look for 404s

2. **Check for CSS Modules issues:**
   - Class names should be transformed (e.g., `Landing_main__x7y2z`)

3. **Check build output:**
   ```bash
   npm run build
   ls .next/static/css/
   ```

**Fixes:**
- Clear build cache: `rm -rf .next`
- Check `next.config.js` for CSS-related settings
- Verify CSS imports use `.module.css` extension

### Problem: Page Loads Then Disappears

**Symptom**: Content flashes briefly, then page goes blank.

**Diagnosis:**

1. **Check for JavaScript errors:**
   - DevTools → Console
   - Look for exceptions after page loads

2. **Check for hydration mismatches:**
   - Server HTML differs from client render
   - Often caused by date/time or random values

3. **Check for infinite loops:**
   - `useEffect` with missing dependencies
   - State updates that trigger re-renders

**Fixes:**
- Wrap browser-only code in `if (typeof window !== 'undefined')`
- Add dependencies to `useEffect` arrays
- Use stable references for callbacks

### Problem: Cache Shows Old Content

**Symptom**: Published new content, but visitors see old version.

**Diagnosis:**

1. **Check if revalidation was called:**
   - Look for "[Publish] ISR revalidated" in logs

2. **Check CDN cache headers:**
   - DevTools → Network → Response Headers
   - Look for `Cache-Control`, `Age` headers

3. **Force refresh:**
   - Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)

**Fixes:**
- Verify `res.revalidate()` is being called in publish
- Check CDN purge is configured (for Cloudflare)
- Reduce `revalidate` time in `getStaticProps`

### Problem: Username/Slug Conflicts

**Symptom**: Publishing fails with "slug taken" or similar.

**Diagnosis:**

   ```sql
-- Check for slug conflicts
SELECT p.id, p.slug, u.username 
FROM pages p 
JOIN users u ON p.user_id = u.id 
WHERE p.slug = 'conflicting-slug';
```

**Fixes:**
- The publish flow clears slug from other pages first:
  ```typescript
  await d.update(schema.pages)
    .set({ slug: null })
    .where(and(eq(schema.pages.slug, slug), sql`id != ${pageId}`));
  ```

---

## 16. How to Safely Extend the System

### Adding a New Block Type

Example: Adding a "Quote" block type.

**1. Update types** (`src/shared/types/index.ts`):
   ```typescript
export type BlockType = 'TEXT' | 'IMAGE' | 'LINK' | 'QUOTE';
```

**2. Update schema** (`src/lib/schema/page.ts`):
```typescript
export const QuoteContentSchema = z.object({
  text: z.string(),
  author: z.string().optional(),
});

export const QuoteBlockSchema = BlockBase.extend({
  type: z.literal('quote'),
  content: QuoteContentSchema,
});

export const BlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  LinkBlockSchema,
  ImageBlockSchema,
  QuoteBlockSchema, // Add new type
]);
```

**3. Update editor** (`src/components/editor/Block.tsx`):
```typescript
case 'QUOTE':
  return <QuoteBlockEditor block={block} />;
```

**4. Update viewer** (`src/components/viewer/ViewerBlock.tsx`):
```typescript
case 'QUOTE':
  return <QuoteBlockViewer content={content} />;
```

**5. Update conversion helpers** if needed for legacy data.

### Adding a New Database Field

Example: Adding a "bio" field to users.

**1. Update schema** (`src/server/db/schema.ts`):
```typescript
export const users = pgTable('users', {
  // ... existing fields
  bio: text('bio'),  // Add new field
});
```

**2. Create migration:**
   ```bash
npm run db:generate  # Generates migration SQL
npm run db:push      # Applies to database
```

**3. Update TypeScript types** (`src/server/db/types.ts`):
```typescript
export interface DbUser {
  // ... existing fields
  bio?: string;
}
```

**4. Update mapper** (`src/server/db/postgres.ts`):
```typescript
function mapUser(u: schema.User): DbUser {
  return {
    // ... existing fields
    bio: u.bio,
  };
}
```

### Adding UI Without Breaking Themes

**Rules:**
1. Use CSS variables from themes, not hardcoded colors
2. Test on light AND dark backgrounds
3. Use the platform UI token system for floating UI

**Example:**
```css
/* Good - uses theme variables */
.myButton {
  background: var(--accent-primary);
  color: var(--text-primary);
}

/* Bad - hardcoded, will break on some themes */
.myButton {
  background: #6366f1;
  color: #1a1a2e;
}
```

### Protecting Public Pages

When modifying anything that affects public pages:

**Pre-deployment checklist:**
1. Test page loads at `/{slug}`
2. Verify published content displays correctly
3. Check that blocks render at correct positions
4. Test on mobile AND desktop
5. Verify the "Make your own" button is visible
6. Test after publish (revalidation works)

**Rollback plan:**
- Keep previous deployment artifacts
- Database schema changes need down migrations
- Feature flags for gradual rollout

---

## 17. Final Mental Model

### The Complete Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │  Landing    │  │   Editor    │  │       Viewer                │  │
│  │  /          │  │   /new      │  │       /{slug}               │  │
│  │             │  │   /edit     │  │                             │  │
│  │ Static page │  │             │  │  ISR-rendered page          │  │
│  │             │  │ Draft:      │  │  Shows published content    │  │
│  │ CTA → /new  │  │ localStorage│  │                             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
│         │                │                        ▲                  │
│         │                │ (fetch)                │                  │
│         │                ▼                        │                  │
│  ┌──────┴────────────────────────────────────────┴────────────────┐ │
│  │                         API Calls                               │ │
│  │  /api/me      - Who am I?                                       │ │
│  │  /api/publish - Save content to database + storage              │ │
│  │  /api/upload  - Upload images                                   │ │
│  │  /auth/google - Start OAuth flow                                │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTP Request
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SERVER (Node.js)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Express + Next.js                          │   │
│  │                                                               │   │
│  │  Request → Session Middleware → Route Matching → Handler      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         │              │                │              │            │
│         ▼              ▼                ▼              ▼            │
│  ┌───────────┐  ┌────────────┐  ┌─────────────┐  ┌────────────┐    │
│  │   Auth    │  │  API       │  │   GraphQL   │  │  Next.js   │    │
│  │  /auth/*  │  │  /api/*    │  │  /graphql   │  │  Pages     │    │
│  │           │  │            │  │             │  │            │    │
│  │ Google    │  │ publish    │  │ Queries     │  │ SSR / ISR  │    │
│  │ OAuth     │  │ upload     │  │ Mutations   │  │            │    │
│  └───────────┘  └────────────┘  └─────────────┘  └────────────┘    │
│         │              │                │              │            │
│         └──────────────┴────────────────┴──────────────┘            │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                        Database                               │   │
│  │                                                               │   │
│  │  users:  id | email | username | google_sub | ...             │   │
│  │  pages:  id | slug  | content  | publishedContent | ...       │   │
│  │                                                               │   │
│  │  Development: SQLite (data/my-corner.db)                      │   │
│  │  Production:  PostgreSQL (Supabase)                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      File Storage                             │   │
│  │                                                               │   │
│  │  Development: public/uploads/ (local disk)                    │   │
│  │  Production:  Supabase Storage or S3-compatible (R2)          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### How Everything Fits Together

1. **The User Journey**:
   - Visitor sees a page → Clicks "Make your own" → Edits (draft) → Signs in → Publishes → Has their own URL

2. **Data Layers**:
   - Client state (React) → localStorage (drafts) → Server API → Database → Static pages

3. **Authentication Flow**:
   - Anonymous browsing → Google OAuth → Session cookie → Authenticated requests

4. **Publishing Flow**:
   - Draft (localStorage) → Validate → Render HTML → Upload to storage → Save to DB → Invalidate cache

### What to Learn Next

Now that you understand this codebase, explore:

1. **React deeper dive**: Hooks, context, optimization
2. **Next.js App Router**: The newer routing paradigm (this uses Pages Router)
3. **Database design**: Normalization, indexes, query optimization
4. **Infrastructure**: Docker, Kubernetes, CI/CD pipelines
5. **Security**: OWASP top 10, penetration testing
6. **Performance**: Lighthouse, Core Web Vitals, profiling

### Congratulations

You now understand:
- ✅ How the web works (requests, responses, browsers, servers)
- ✅ How modern web apps are structured (frontend/backend/database)
- ✅ How authentication and sessions work
- ✅ How to trace a request from browser to database and back
- ✅ How to debug common issues
- ✅ How to safely extend the system

You could now:
- Add new features to this codebase
- Debug production issues
- Deploy changes safely
- Explain to others how it works

**You didn't just learn about this project—you learned how to build web applications.**

---

## Quick Reference

### Key File Paths

| What | Where |
|------|-------|
| Server entry | `src/server/index.ts` |
| Database schema | `src/server/db/schema.ts` |
| Page routes | `src/pages/*.tsx` |
| Editor | `src/components/editor/Editor.tsx` |
| Public viewer | `src/components/viewer/PublicPageView.tsx` |
| Auth config | `src/server/auth/passport.ts` |
| Environment config | `src/lib/config.ts` |

### Key Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev:local` | Start dev server (SQLite) |
| `npm run build` | Build for production |
| `npm run db:studio:local` | Browse local database |
| `npm run test` | Run tests |

### Key URLs (Development)

| URL | Purpose |
|-----|---------|
| `http://localhost:3001` | Landing page |
| `http://localhost:3001/new` | Anonymous editor |
| `http://localhost:3001/edit` | Authenticated editor |
| `http://localhost:3001/{username}` | Public page |
| `http://localhost:3001/api/me` | Current user API |

---

*This README was crafted to teach web development from first principles, grounded entirely in the actual code of this production application. Every concept maps to real files you can inspect and modify.*
