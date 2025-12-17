# CTA Flow Test Plan

## Test Scenarios

### Scenario 1: First-Time User (No Account)
**Steps:**
1. Visit `/` (landing page)
2. Click "make your own corner" CTA
3. Complete Google OAuth sign-in
4. Set username in onboarding modal
5. Editor loads with starter template
6. Make some edits (e.g., change headline text)
7. Click "Publish"

**Expected Results:**
- ✅ Landing page shows with CTA button
- ✅ Clicking CTA triggers Google OAuth
- ✅ After auth, redirected to `/edit?onboarding=true`
- ✅ Username modal appears
- ✅ After setting username, editor shows starter template blocks
- ✅ Can edit starter blocks
- ✅ Publish succeeds
- ✅ Redirected to `/{username}` showing published page

---

### Scenario 2: First-Time User (Already Logged In)
**Steps:**
1. Already authenticated user visits landing page `/`
2. Click "make your own corner" CTA

**Expected Results:**
- ✅ CTA immediately navigates to `/edit` (no auth needed)
- ✅ Editor loads with starter template (no published pages yet)
- ✅ Can create and publish

---

### Scenario 3: Returning User (Has Published Pages)
**Steps:**
1. User with published pages visits landing page `/`
2. Click "make your own corner" CTA
3. Editor loads
4. Make some edits
5. Click "Publish"

**Expected Results:**
- ✅ CTA navigates to `/edit`
- ✅ Editor loads with **most recently published page** (not starter template)
- ✅ Content from last publish is displayed
- ✅ Edits are saved
- ✅ Publish succeeds
- ✅ Redirected to `/{username}` showing updated page

---

### Scenario 4: Direct `/edit` Access (Logged Out)
**Steps:**
1. Logged out user directly visits `/edit` URL

**Expected Results:**
- ✅ Immediately redirected to `/` (landing page)
- ✅ Must click CTA to proceed (enforces auth)

---

### Scenario 5: Direct `/edit` Access (Logged In, No Published Pages)
**Steps:**
1. Authenticated user (no published pages) directly visits `/edit`

**Expected Results:**
- ✅ Editor loads with starter template
- ✅ Can create and publish

---

### Scenario 6: Direct `/edit` Access (Logged In, Has Published Pages)
**Steps:**
1. Authenticated user (with published pages) directly visits `/edit`

**Expected Results:**
- ✅ Editor loads with most recently published page
- ✅ NOT the starter template

---

### Scenario 7: Multiple Published Pages
**Setup:** User has published multiple pages at different times

**Steps:**
1. Visit `/edit`

**Expected Results:**
- ✅ Editor loads the page with the **most recent** `publishedAt` timestamp
- ✅ Not the first created page, but the most recently published one

---

### Scenario 8: Publish from Draft Mode
**Steps:**
1. User creates new draft (starter template)
2. Make edits
3. Click "Publish"

**Expected Results:**
- ✅ Draft is saved to server
- ✅ Page is published
- ✅ User is **redirected** to `/{username}` (not toast)
- ✅ Published page shows correct content

---

### Scenario 9: Publish from Server Mode
**Steps:**
1. User loads existing published page
2. Make edits
3. Click "Publish"

**Expected Results:**
- ✅ Changes are saved to server
- ✅ Page is republished
- ✅ User is **redirected** to `/{username}` (not toast)
- ✅ Published page shows updated content

---

## Edge Cases

### Edge Case 1: User Without Username Tries to Publish
**Expected:** Onboarding modal appears to set username first (existing behavior)

### Edge Case 2: Auth Session Expires During Edit
**Expected:** Publish triggers auth gate, user re-authenticates, returns to `/edit`

### Edge Case 3: User Presses Browser Back After Publish
**Expected:** Navigates back to `/edit`, loads most recently published page

---

## Regression Tests

### Existing Features to Verify Still Work
- [ ] Username onboarding flow
- [ ] Block creation and editing
- [ ] Image upload
- [ ] Background customization
- [ ] Public page viewing at `/{username}`
- [ ] Fork functionality (if applicable)
- [ ] Feedback modal
- [ ] Keyboard shortcuts
- [ ] Undo/redo

---

## Technical Validation

### Backend
- [ ] `myPage` query returns most recently published page
- [ ] `myPage` query returns `null` if no published pages
- [ ] Publish mutation updates `publishedAt` timestamp
- [ ] Multiple pages sorted correctly by `publishedAt`

### Frontend
- [ ] Landing page renders correctly
- [ ] CTA button checks auth state
- [ ] `/edit` redirects logged-out users to `/`
- [ ] Editor loads starter template for new users
- [ ] Editor loads latest published page for returning users
- [ ] Publish always redirects to `/{username}`
- [ ] No console errors
- [ ] No linter errors

---

## Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

---

## Performance Checks
- [ ] Landing page loads quickly
- [ ] `/edit` page resolves auth state without flash
- [ ] No unnecessary re-renders
- [ ] Starter template loads instantly
- [ ] Publish completes within 2-3 seconds

