# CTA Flow Implementation

## Overview
Implemented end-to-end flow: CTA → sign-in → edit → publish with minimal code changes and no routing ambiguity.

## Changes Made

### 0. Published Pages: Added Auth-Gated CTA
**File:** `src/pages/[username].tsx`

- Converted header CTA from Link to button
- Added AuthGate modal component
- CTA behavior on published pages:
  - If authenticated → navigate to `/edit`
  - If not authenticated → show auth popup (AuthGate modal)
- After successful auth → redirects to `/edit` via auth callback
- Also updated "not found" page CTA to use same auth-gated flow

### 1. Backend: Modified `myPage` Resolver
**File:** `src/server/graphql/resolvers.ts`

- Changed `myPage` query to return the **most recently published page** (sorted by `publishedAt` timestamp)
- Returns `null` if user has no published pages (signals to load starter template)
- This ensures `/edit` always loads the latest published content or starter template

### 2. Frontend: Created Landing Page with CTA
**File:** `src/pages/index.tsx`

- Replaced auto-redirect with proper landing page
- Added "make your own corner" CTA button
- CTA behavior:
  - If authenticated → navigate to `/edit`
  - If not authenticated → trigger Google OAuth with `returnTo=/edit`
- Uses Apollo Client to check auth state before deciding flow

### 3. Updated `/edit` Page Logic
**File:** `src/pages/edit/index.tsx`

- Simplified page loading logic:
  1. If user has published page → load it (server mode)
  2. If user has no published pages → create new draft with starter template (draft mode)
  3. If not authenticated → redirect to landing page `/`
- Removed anonymous draft support (flow requires auth)
- Removed check for active drafts from localStorage (simplified flow)

### 4. Updated Publish Flow
**File:** `src/components/editor/usePublish.ts`

- Changed publish behavior to **always redirect to `/{username}`** after successful publish
- Previously: draft mode redirected, server mode showed toast
- Now: both modes redirect to public URL for consistency
- Ensures user always lands on their public page after publishing

### 5. Simplified Auth Callback
**File:** `src/server/auth/routes.ts`

- Removed complex redirect logic based on published page status
- After successful auth:
  - If no username → redirect to `/edit?onboarding=true` (shows username modal)
  - If has username → redirect to `returnTo` URL (typically `/edit`)
- Simplified flow ensures consistent behavior

## Flow Validation

### First-Time User Flow (From Landing Page)
1. User clicks CTA on landing page
2. Not authenticated → triggers Google OAuth
3. After auth success → redirects to `/edit?onboarding=true`
4. Username modal appears, user sets username
5. Editor loads with starter template (no published pages)
6. User edits and clicks publish
7. Redirects to `/{username}` showing their published page

### First-Time User Flow (From Published Page)
1. User visits someone's published page `/{username}`
2. Clicks CTA "Want your own corner of the internet?"
3. Not authenticated → AuthGate modal appears with Google sign-in
4. User signs in via Google OAuth
5. After auth success → redirects to `/edit?onboarding=true`
6. Username modal appears, user sets username
7. Editor loads with starter template (no published pages)
8. User edits and clicks publish
9. Redirects to their own `/{username}` showing their published page

### Returning User Flow (Already Authenticated)
1. User clicks CTA on landing page, published page, or visits `/edit` directly
2. Already authenticated → goes to `/edit`
3. Editor loads their most recently published page
4. User edits and publishes
5. Redirects to `/{username}` showing updated published page

### Direct `/edit` Access (Logged Out)
1. User visits `/edit` URL directly
2. Not authenticated → redirects to `/` (landing page)
3. User must click CTA to proceed (enforces auth requirement)

## Key Principles Maintained

- ✅ No anonymous drafts (auth required)
- ✅ Canonical routes: `/edit` for editor, `/{username}` for public page
- ✅ No IDs in public URLs
- ✅ Minimal code changes
- ✅ Reused existing auth/session logic
- ✅ No new abstractions added

## Database Schema
No schema changes were required. Existing fields used:
- `pages.publishedAt` - timestamp for sorting most recent published page
- `pages.isPublished` - boolean flag to filter published pages
- `users.username` - for public URL generation

## Testing Checklist

- [ ] Logged out user clicks CTA → sign-in → `/edit` opens starter page
- [ ] After first publish → redirect to `/{username}`
- [ ] Returning user visits `/edit` → loads most recently published page
- [ ] Already logged-in user clicks CTA → goes straight to `/edit`
- [ ] Direct `/edit` visit while logged out → redirects to landing page
- [ ] Publish from draft mode → redirects to `/{username}`
- [ ] Publish from server mode → redirects to `/{username}`

