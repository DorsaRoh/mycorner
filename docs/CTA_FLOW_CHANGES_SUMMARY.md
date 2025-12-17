# CTA Flow Changes Summary

## Files Modified

### 0. `/src/pages/[username].tsx` (Published Page)
**Before:** Header CTA was a Link to landing page with `?fresh=1`  
**After:** Button that shows auth popup or navigates to `/edit`

**Key Changes:**
- Changed header CTA from `<Link>` to `<button>`
- Added `useState` for AuthGate modal visibility
- Added `handleCTAClick` function:
  - If authenticated → `router.push('/edit')`
  - If not authenticated → `setShowAuthGate(true)` (shows modal)
- Added AuthGate modal component to page
- Also updated 404 "not found" CTA to use same pattern

### 1. `/src/pages/index.tsx` (Landing Page)
**Before:** Auto-redirected to `/edit`  
**After:** Shows landing page with CTA button

**Key Changes:**
- Added Apollo Client `ME_QUERY` to check auth state
- Added CTA button "make your own corner"
- CTA logic:
  - If authenticated → `router.push('/edit')`
  - If not authenticated → `window.location.href = auth.google('/edit')`
- Shows loading state while checking auth
- Proper landing page UI with title, subtitle, and hint text

---

### 2. `/src/pages/edit/index.tsx` (Editor Page)
**Before:** Complex logic checking for server pages, active drafts, creating anonymous drafts  
**After:** Simplified auth-required flow

**Key Changes:**
- Removed anonymous draft support
- Removed active draft checking from localStorage
- New logic:
  1. If authenticated + has published page → load it (server mode)
  2. If authenticated + no published pages → create draft with starter (draft mode)
  3. If not authenticated → redirect to `/` (landing)
- Removed `?fresh=1` handling (no longer needed)
- Always requires authentication

---

### 3. `/src/server/graphql/resolvers.ts` (Backend)
**Before:** `myPage` returned first page from user's pages  
**After:** Returns most recently published page

**Key Changes:**
- Filter pages by `is_published` and `published_at`
- Sort by `publishedAt` descending (most recent first)
- Return most recent published page
- Return `null` if no published pages (signals starter template)

```typescript
// Filter published pages
const publishedPages = pages.filter(p => p.is_published && p.published_at);

// Sort by most recent
publishedPages.sort((a, b) => {
  const dateA = new Date(a.published_at!).getTime();
  const dateB = new Date(b.published_at!).getTime();
  return dateB - dateA;
});

return publishedPages[0] || null;
```

---

### 4. `/src/components/editor/usePublish.ts` (Publish Hook)
**Before:** Draft mode redirected, server mode showed toast  
**After:** Both modes redirect to `/{username}`

**Key Changes:**
- Server mode now redirects instead of showing toast
- Added `refetchMe()` call to ensure latest username
- Consistent redirect behavior: `router.replace(publicUrl)`
- Both draft and server modes follow same flow

```typescript
// Server mode (lines ~255-268)
const { data: freshMe } = await refetchMe();
const username = freshMe?.me?.username || publishData.page?.owner?.username;

if (!username) {
  throw new Error('Cannot publish without a username. Please try again.');
}

const publicUrl = publishData.publicUrl
  ? `${window.location.origin}${publishData.publicUrl}`
  : getAbsoluteUrl(routes.user(username));

// Redirect instead of toast
router.replace(publicUrl);
```

---

### 5. `/src/server/auth/routes.ts` (Auth Callback)
**Before:** Complex redirect logic checking published pages  
**After:** Simplified redirect to `returnTo` or `/edit`

**Key Changes:**
- Removed published page checking
- Simplified logic:
  - If no username → `/edit?onboarding=true`
  - If has username → `returnTo` (from session) or `/edit`
- Honors `returnTo` URL passed during OAuth initiation

```typescript
// After successful login
if (!user.username) {
  return res.redirect('/edit?onboarding=true');
}

return res.redirect(returnTo || '/edit');
```

---

## Files NOT Modified (But Relevant)

### `/src/components/editor/Editor.tsx`
- Already has logic to load starter template for empty drafts (lines 282-302)
- No changes needed, existing behavior works perfectly

### `/src/lib/starter/starterLayout.ts`
- Already has starter template definition
- No changes needed

### `/src/server/db/schema.ts`
- Schema already has `publishedAt` timestamp
- No migrations needed

---

## Lines of Code Changed

| File | Lines Added | Lines Removed | Net Change |
|------|-------------|---------------|------------|
| `src/pages/[username].tsx` | 25 | 7 | +18 |
| `src/pages/index.tsx` | 52 | 18 | +34 |
| `src/pages/edit/index.tsx` | 16 | 25 | -9 |
| `src/server/graphql/resolvers.ts` | 14 | 4 | +10 |
| `src/components/editor/usePublish.ts` | 12 | 3 | +9 |
| `src/server/auth/routes.ts` | 6 | 14 | -8 |
| **Total** | **125** | **71** | **+54** |

---

## Database Changes

**None required.** All necessary fields already exist:
- `pages.publishedAt` (timestamp)
- `pages.isPublished` (boolean)
- `users.username` (string)

---

## API Changes

### GraphQL Query Modified
**Query:** `myPage`  
**Before:** Returns first page from user's pages  
**After:** Returns most recently published page (or null)

**Response Behavior:**
- `{ myPage: null }` → User has no published pages → Load starter template
- `{ myPage: { id, blocks, ... } }` → User has published pages → Load that page

No breaking changes for clients.

---

## Environment Variables

No new environment variables required. Uses existing:
- `GOOGLE_CLIENT_ID` (existing)
- `GOOGLE_CLIENT_SECRET` (existing)
- `DATABASE_URL` (existing)

---

## Migration Path

**For existing users:**
- No data migration needed
- First visit to `/edit` after deploy will load their most recent published page
- If they have multiple published pages, the most recent one loads
- If they have no published pages, starter template loads

**For new users:**
- See landing page at `/`
- Click CTA → authenticate → load starter template → publish
- Clean, guided flow

---

## Deployment Notes

1. **No database migrations required**
2. **No environment variable changes**
3. **Backward compatible** - existing users won't be disrupted
4. **Deploy in single step** - frontend and backend can be deployed together
5. **No feature flags needed** - changes are self-contained

---

## Testing Checklist Before Deploy

- [ ] Landing page loads at `/`
- [ ] Landing page CTA works for logged-in users
- [ ] Landing page CTA triggers OAuth for logged-out users
- [ ] Published page CTA shows auth popup for logged-out users
- [ ] Published page CTA navigates to `/edit` for logged-in users
- [ ] Auth popup closes on cancel
- [ ] OAuth callback redirects to `/edit`
- [ ] `/edit` redirects logged-out users to `/`
- [ ] `/edit` loads starter template for new users
- [ ] `/edit` loads most recent published page for returning users
- [ ] Publish redirects to `/{username}` (both draft and server modes)
- [ ] No console errors
- [ ] No linter errors
- [ ] All existing features still work (username onboarding, editing, publishing, etc.)

---

## Rollback Plan

If issues arise, revert these 6 files:
1. `src/pages/[username].tsx`
2. `src/pages/index.tsx`
3. `src/pages/edit/index.tsx`
4. `src/server/graphql/resolvers.ts`
5. `src/components/editor/usePublish.ts`
6. `src/server/auth/routes.ts`

No database rollback needed (no schema changes).

