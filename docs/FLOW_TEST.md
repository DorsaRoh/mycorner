# Auth + Publish Flow - Manual Test Checklist

## Prerequisites

### Start Local Server
```bash
npm run dev:local  # Runs on port 3001 with SQLite
# OR
npm run dev        # Runs on port 3000 with your configured database
```

### Test Environment Setup
- Clear browser cookies/data for fresh incognito testing
- Use incognito/private browsing mode for each test
- Have Google account ready for auth

---

## ✅ Acceptance Checklist

### [ ] Fresh Incognito User Flow
1. **Start**: Open `http://localhost:3001` (or 3000) in incognito
2. **Landing**: Should see "your corner of the internet" with "Make your own corner" CTA
3. **Click CTA**: Navigate to `/edit` → should load editor with starter blocks
4. **Edit**: Can modify content, add blocks, change background
5. **Publish**: Click "Publish" → should trigger Google auth modal
6. **Auth**: Complete Google OAuth → should redirect back to editor
7. **Auto-publish**: Should automatically publish and redirect to `/p/[slug]`
8. **Published view**: Should show published page with Edit + Share buttons

### [ ] Returning User Flow
1. **Start**: Open `http://localhost:3001/edit` in incognito
2. **Editor**: Should load existing user's page (if authenticated) or new draft
3. **Draft persistence**: Refresh page → draft should be preserved
4. **Publish**: Click Publish → should auto-publish and redirect to published page

### [ ] Sharing Flow
1. **Copy URL**: From published page, click Share → URL copied to clipboard
2. **New browser**: Open the URL in different browser/incognito
3. **Viewer view**: Should show published page WITHOUT Edit/Share controls
4. **CTA**: Should show "Want your own corner of the internet?" link

### [ ] Owner Controls
1. **Edit button**: Click Edit → should navigate to `/edit/[pageId]`
2. **Draft loading**: Should load the current draft state
3. **Publish updates**: Click Update → should publish changes and redirect back

### [ ] Draft Safety
1. **Anonymous editing**: Can edit for hours without auth
2. **Refresh**: Page refresh preserves all changes
3. **Auth interruption**: Auth flow preserves draft state
4. **Publish failure**: If publish fails, can retry without losing work

---

## 🔍 Technical Validation

### Routing
- [ ] `GET /` → Landing page with CTA
- [ ] `GET /edit` → Redirects to appropriate editor (draft or existing)
- [ ] `GET /edit/[id]` → Editor for specific page/draft
- [ ] `GET /p/[id]` → Public published view
- [ ] `GET /u/[username]` → Public view by username

### Auth Gating
- [ ] Anonymous users can access `/edit` and edit drafts
- [ ] Publish requires authentication
- [ ] Auth continuation preserves draft state
- [ ] No infinite redirects or auth loops

### Data Integrity
- [ ] Drafts saved to localStorage persist across refreshes
- [ ] Server-side draft persistence works
- [ ] Publish creates proper snapshot
- [ ] Ownership correctly assigned
- [ ] Slugs generated uniquely

### UI States
- [ ] Publish button shows correct states (Publish/Update/Published ✓)
- [ ] Loading states during publish
- [ ] Error states with retry options
- [ ] Auth gate modal appears correctly
- [ ] Published page shows Edit/Share only to owners

---

## 🐛 Bug Scenarios to Test

### Edge Cases
- [ ] Close auth modal without signing in → should return to editor
- [ ] Auth fails → should show error and allow retry
- [ ] Network errors during save/publish → graceful handling
- [ ] Multiple tabs open → state consistency
- [ ] Browser back/forward → no broken states

### Data Scenarios
- [ ] Empty page publish → should work
- [ ] Large page with many blocks → performance
- [ ] Special characters in content → encoding/sanitization
- [ ] Concurrent edits → conflict resolution

---

## 📱 Cross-browser Testing

### Browsers to Test
- [ ] Chrome (primary)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

### Mobile Considerations
- [ ] Touch interactions work
- [ ] Auth flow on mobile
- [ ] Responsive design
- [ ] Share button uses native share API

---

## 🚀 Production Readiness

### Performance
- [ ] Page loads quickly (< 2s)
- [ ] Autosave doesn't spam server
- [ ] Publish completes within 5s
- [ ] Large images don't break layout

### Security
- [ ] No sensitive data in client bundles
- [ ] Auth tokens properly secured
- [ ] XSS protection in user content
- [ ] Rate limiting works

### SEO & Sharing
- [ ] Open Graph meta tags present
- [ ] Page titles correct
- [ ] URLs are shareable
- [ ] Social media unfurling works

---

## 🛠️ Debug Commands

```bash
# Check localStorage state
console.log(Object.keys(localStorage).filter(k => k.includes('mycorner')));

# Check database (SQLite)
sqlite3 data/my-corner.db "SELECT id, title, is_published, slug FROM pages LIMIT 5;"

# Check auth status
curl http://localhost:3001/api/me

# Clear all draft data
Object.keys(localStorage).filter(k => k.includes('mycorner')).forEach(k => localStorage.removeItem(k));
```

---

## ✅ Final Sign-off

All tests pass and flow works end-to-end:
- [ ] Fresh user can create and publish
- [ ] Returning users see their work
- [ ] Sharing works across browsers
- [ ] No data loss during auth
- [ ] Performance acceptable
- [ ] Security concerns addressed
