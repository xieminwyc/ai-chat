# Account Overview And Verification Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/account` from a placeholder into a useful authenticated page by adding richer account details and a resend-verification action for unverified users.

**Architecture:** Keep `src/app/account/page.tsx` as the authenticated Server Component entry that resolves access and renders account overview data. Add a tiny client-side verification action component dedicated to calling `/api/auth/resend-verification`, owning its own loading and feedback state, and only rendering when the current user is still unverified.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File Map

- Create: `docs/superpowers/specs/2026-04-10-account-overview-and-verification-action-learning.md`
- Create: `docs/superpowers/plans/2026-04-10-account-overview-and-verification-action-implementation.md`
- Create: `src/app/account/verification-action.tsx`
- Create: `src/app/account/verification-action.test.tsx`
- Modify: `src/app/account/page.tsx`
- Modify: `src/app/account/page.test.tsx`
- Modify: `progress.md`

## Task 1: Add Verification Action Component

**Files:**
- Create: `src/app/account/verification-action.tsx`
- Create: `src/app/account/verification-action.test.tsx`

- [ ] **Step 1: Write the failing verification-action tests**

Cover:
- clicking resend calls `/api/auth/resend-verification`
- success response shows a success message
- failed response shows an error message
- button is disabled while the request is in flight

- [ ] **Step 2: Run the focused verification-action test to verify it fails**

Run: `npm test -- src/app/account/verification-action.test.tsx`
Expected: FAIL because the component does not exist yet

- [ ] **Step 3: Implement the minimal verification-action component**

Create a small client component that:
- renders status copy based on `isEmailVerified`
- shows a resend button only for unverified users
- posts to `/api/auth/resend-verification`
- manages loading, success, and error feedback

- [ ] **Step 4: Run the focused verification-action test to verify it passes**

Run: `npm test -- src/app/account/verification-action.test.tsx`
Expected: PASS

## Task 2: Enrich `/account` Page

**Files:**
- Modify: `src/app/account/page.tsx`
- Modify: `src/app/account/page.test.tsx`

- [ ] **Step 1: Write the failing `/account` page tests**

Expand coverage so it verifies:
- registration time is rendered
- verified users see a completed verification state
- unverified users see the verification action section

- [ ] **Step 2: Run the focused `/account` page test to verify it fails**

Run: `npm test -- src/app/account/page.test.tsx`
Expected: FAIL because the richer overview and action section are not rendered yet

- [ ] **Step 3: Implement the minimal `/account` page updates**

Update the page to:
- render a richer account overview card
- format and display registration time
- render the verification-action component with the current verification state

- [ ] **Step 4: Run the focused `/account` page test to verify it passes**

Run: `npm test -- src/app/account/page.test.tsx`
Expected: PASS

## Task 3: Verify The Slice

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run the account-focused tests**

Run:
- `npm test -- src/app/account/verification-action.test.tsx`
- `npm test -- src/app/account/page.test.tsx`

Expected: PASS

- [ ] **Step 2: Run adjacent regression tests**

Run:
- `npm test -- src/components/chat-app.test.tsx`

Expected: PASS

- [ ] **Step 3: Run repository quality checks**

Run:
- `npm run lint`
- `npm run build`

Expected:
- no new lint errors introduced by this slice
- build succeeds

- [ ] **Step 4: Update progress log**

Record:
- richer account overview landed
- verification action moved into `/account`
- verification commands and outcomes
