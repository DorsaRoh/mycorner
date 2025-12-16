# Routing Audit

**Audit Date:** 2025-01-06 (Updated)  
**Framework:** Next.js 14.0.4 (Pages Router) with Express custom server

## Canonical URL Structure

**Principle: No internal IDs in URLs. Only usernames.**

### Frontend Pages (Next.js)

| Route Pattern | File | Description |
|--------------|------|-------------|
| `/` | `pages/index.tsx` | Redirects to `/edit` |
| `/edit` | `pages/edit/index.tsx` | **THE** edit page - each user has one page |
| `/{username}` | `pages/[username].tsx` | **Canonical** - View user's published page |
| `/404` | `pages/404.tsx` | Not found page |
| `/500` | `pages/500.tsx` | Server error page |

### Legacy Routes (All Redirect - IDs Never in URLs)

| Route Pattern | Redirects To | Status |
|--------------|--------------|--------|
| `/edit/:id` | `/edit` | 301 permanent - IDs not in URLs |
| `/p/:id` | `/{username}` | 301 permanent - lookup owner → redirect |
| `/u/:username` | `/{username}` | 301 permanent - moved to root level |

### Server API Routes (Express)

| Route Pattern | Method | Handler | Description |
|--------------|--------|---------|-------------|
| `/auth/google` | GET | `auth/routes.ts` | Google OAuth initiation |
| `/auth/google/callback` | GET | `auth/routes.ts` | Google OAuth callback |
| `/auth/logout` | GET/POST | `auth/routes.ts` | User logout |
| `/auth/status` | GET | `auth/routes.ts` | Auth status check |
| `/api/me` | GET | `api/index.ts` | Current user info |
| `/api/publish` | POST | `api/index.ts` | Publish a page (requires username) |
| `/api/assets/upload` | POST | `upload.ts` | File upload |
| `/api/assets/health` | GET | `upload.ts` | Storage health check |
| `/graphql` | POST | `graphql/index.ts` | GraphQL endpoint |
| `/health` | GET | `index.ts` | Server health check |

## Route Builders

All routes are constructed using helpers from `src/lib/routes.ts`:

```typescript
// Frontend routes
routes.home()         // → "/"
routes.edit()         // → "/edit"
routes.user(username) // → "/{username}"

// Auth routes
auth.google(returnTo) // → "/auth/google?returnTo=..."
auth.logout()         // → "/auth/logout"

// API routes
api.me()             // → "/api/me"
api.publish()        // → "/api/publish"
api.upload()         // → "/api/assets/upload"
api.graphql()        // → "/graphql"

// Server-side
buildPublicPath(username) // → "/{username}"
```

## Username Requirements

- **Format:** 3-20 characters, lowercase letters, numbers, underscores only
- **Pattern:** `^[a-z0-9_]{3,20}$`
- **Uniqueness:** Enforced at database level
- **Required for publishing:** Users must set a username before publishing

### GraphQL Mutations

```graphql
# Set username (required before publishing)
mutation SetUsername($username: String!) {
  setUsername(username: $username) {
    success
    error
    username
  }
}

# Check if username is available
query CheckUsernameAvailable($username: String!) {
  usernameAvailable(username: $username)
}
```

## Reserved Paths

These paths cannot be used as usernames:

- `edit` - Editor
- `api` - API routes
- `auth` - Authentication
- `graphql` - GraphQL endpoint
- `health` - Health check
- `_next` - Next.js internals
- `static` - Static files
- `404`, `500` - Error pages

## Validation & Tests

### Route Tests

```bash
npm run test:routes
```

Tests verify:
- Route constants are correct
- Route builders output canonical URLs
- Username validation works
- Path normalization handles edge cases

### Route Check Script

```bash
npm run check:routes
```

Scans codebase for hardcoded routes that should use route builders.

## Migration Notes

### From ID-based URLs to Username-based URLs

1. **Old:** `/p/{pageId}` → **New:** `/{username}`
2. **Old:** `/u/{username}` → **New:** `/{username}` (moved to root)
3. **Old:** `/edit/{pageId}` → **New:** `/edit` (each user has one page)

### Redirects Implemented

- `/edit/:id` → `/edit` (permanent, in next.config.js)
- `/p/:id` → `/{username}` (permanent, server-side lookup)
- `/u/:username` → `/{username}` (permanent, direct redirect)

## Security Considerations

1. **No ID exposure:** Internal page/user IDs never appear in URLs
2. **Username validation:** Strict format requirements prevent injection
3. **Reserved paths:** System paths protected from username collision
4. **Auth requirement:** Publishing requires authentication AND username
