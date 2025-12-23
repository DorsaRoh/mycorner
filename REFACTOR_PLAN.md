# MyCorner Refactor Plan

**Status: ✅ COMPLETE**

## Final Architecture

### Routes (Locked)

| Route | Purpose | Auth |
|-------|---------|------|
| `/` | Landing page → CTA to /new | No |
| `/new` | Anonymous editor (localStorage draft) | No |
| `/u/[slug]` | Public page (canonical, published only) | No |
| `/edit` | Authenticated editor (loads from DB) | Yes |

### Legacy Routes (Redirect/404 Only)

| Route | Behavior |
|-------|----------|
| `/[username]` | Redirects to `/u/[slug]` if published, else 404 |

### Deleted Routes

- `/edit/[id]` - Removed
- `/p/[id]` - Removed

---

## Viral Loop (Exact Flow)

```
/u/[slug] (public page)
    ↓
Persistent CTA: "Make your own corner"
    ↓
/new (anonymous editor - localStorage only)
    ↓
Edit locally (autosave to localStorage)
    ↓
Click Publish
    ↓
/auth/google?returnTo=/new?publish=1
    ↓
After auth: /new?publish=1
    ↓
Immediately calls POST /api/publish-draft
(NO username onboarding - slug auto-generated)
    ↓
Redirect to /u/[slug]
```

---

## Publish Flow (Simplified)

1. User clicks Publish on `/new`
2. If unauthenticated → redirect to `/auth/google?returnTo=/new?publish=1`
3. After auth → back on `/new?publish=1`
4. `/new` detects `?publish=1` and calls `POST /api/publish-draft`
5. API:
   - Validates request with Zod
   - Requires authenticated user (NO username requirement)
   - Auto-generates slug: `user.username || user-${userId.slice(0,8)}`
   - Ensures slug uniqueness with `-2`, `-3` suffixes if needed
   - Upserts single row in `pages` table
   - Sets `is_published=true`
   - Returns `{ success: true, slug }`
6. Client clears localStorage draft
7. Client redirects to `/u/[slug]`

---

## Draft Storage (Minimal)

- **Key**: `yourcorner:draft:v1` stores draft ID
- **Data**: `mycorner:draft:{id}` stores draft content
- **No other localStorage keys** (auth continuation, publish toast, etc. removed)

---

## Database (Single Table)

```sql
pages (
  id text primary key,
  user_id uuid references users(id),
  owner_id text not null,
  slug text unique,
  content jsonb not null,
  published_content jsonb,
  is_published boolean not null default false,
  server_revision integer default 1,
  created_at timestamp,
  updated_at timestamp
)
```

---

## Files Changed

### Created
- `/src/pages/u/[slug].tsx` - Canonical public page
- `/src/pages/new.tsx` - Anonymous editor
- `/src/pages/api/publish-draft.ts` - Publish API
- `/src/lib/schema/page.ts` - PageDoc Zod schema
- `/src/lib/schema/page.test.ts` - Schema tests
- `/src/lib/themes.ts` - 10 theme presets
- `/src/lib/db/pages.ts` - Data access layer

### Modified
- `/src/pages/index.tsx` - Simplified landing (CTA → /new)
- `/src/pages/[username].tsx` - Now redirect-only
- `/src/pages/edit/index.tsx` - Simplified auth-only editor
- `/src/lib/draft/storage.ts` - Minimal draft functions

### Deleted
- `/src/pages/edit/[id].tsx`
- `/src/pages/p/[id].tsx`
- `/src/pages/p/` directory

---

## Key Decisions

1. **Public pages at `/u/[slug]`** - Prevents collision with reserved paths
2. **No username onboarding** - Slug auto-generated from userId
3. **Slug is immutable** - Once created, never changes
4. **localStorage only for drafts** - No server-side drafts
5. **Single publish API** - `POST /api/publish-draft`
6. **Same Editor component** - Used by both `/new` and `/edit`

---

## Tests Added

1. PageDoc schema validation
2. Block type validation
3. Style constraint validation
4. Slug generation format
5. publishDraft auth requirement

Run: `npm test`

---

## Remaining Technical Debt

These are not blockers but could be cleaned up later:

1. GraphQL mutations still exist but are not used by new flow
2. Editor component has legacy usePublish hook (could be simplified)
3. draft/storage.ts has stub functions for compatibility

---

## Verification Checklist

- [x] `/` links to `/new`
- [x] `/new` allows anonymous editing
- [x] `/new` Publish triggers auth
- [x] After auth, immediately publishes (no username step)
- [x] Redirects to `/u/[slug]`
- [x] `/u/[slug]` shows persistent CTA
- [x] CTA goes to `/new`
- [x] `/[username]` redirects to `/u/[slug]`
- [x] Legacy routes removed
- [x] Tests pass
- [x] README updated
