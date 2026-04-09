# Guest History Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a verified logged-in user merge chats from the current browser's active guest session into their account without weakening the existing guest or authenticated ownership model.

**Architecture:** Keep the current `route -> service -> repository` layering, add a focused guest-merge workflow in the guest server module, and let homepage bootstrap plus auth-session payloads surface a mergeable guest candidate only when the browser contains both a verified user session and an unmerged guest cookie. Keep the actual transfer transactional: move `Chat` ownership from `guestSessionId` to `userId`, then mark the `GuestSession` as merged so later requests can safely treat it as unavailable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7, PostgreSQL, Vitest, Testing Library, Web Cookies API

---

## Scope Slice

The account-system spec at `docs/superpowers/specs/2026-04-02-auth-and-guest-trial-design.md` still contains two later subsystems after email verification:

1. guest-history merge
2. follow-up guest recovery behavior after merge

This plan intentionally covers subsystem `1` end-to-end:
- detect a mergeable guest in the original browser
- present merge vs. skip in the UI
- implement `POST /api/guest/merge`
- transfer chat ownership and mark the guest session as merged

Longer-term polish such as cross-device merge education, analytics, or permanent dismissal state can come later.

## File Map

- Create: `src/app/api/guest/merge/route.ts`
- Create: `src/app/api/guest/merge/route.test.ts`
- Modify: `src/server/guest/guest-types.ts`
- Modify: `src/server/guest/guest-repository.ts`
- Modify: `src/server/guest/guest-repository.test.ts`
- Modify: `src/server/guest/guest-service.ts`
- Modify: `src/server/guest/guest-service.test.ts`
- Modify: `src/server/page/home-data.ts`
- Modify: `src/server/page/home-data.test.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/session/route.test.ts`
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`

## Target Behavior

- A verified logged-in user on the original guest browser sees that guest history is available to merge.
- The prompt is only shown when:
  - a valid authenticated session exists
  - `currentUser.isEmailVerified === true`
  - a valid unmerged guest cookie exists in the same browser
- Choosing merge transfers all chats from that `GuestSession` to the current `User`.
- After merge:
  - transferred chats appear as user-owned chats
  - the guest session is marked with `mergedAt`
  - later guest reads with that token are treated as unavailable
- Choosing “not now” hides the prompt in the current browser session without deleting guest history.

## Task 1: Add Merge Persistence Helpers

**Files:**
- Modify: `src/server/guest/guest-types.ts`
- Modify: `src/server/guest/guest-repository.ts`
- Modify: `src/server/guest/guest-repository.test.ts`

- [ ] **Step 1: Write failing guest repository tests for merge persistence**

Extend `src/server/guest/guest-repository.test.ts` with cases for:
- reassigning all chats from a guest session to a user
- marking a guest session as merged
- running both updates inside one transaction helper

- [ ] **Step 2: Run the focused repository test to verify it fails**

Run: `npm test -- src/server/guest/guest-repository.test.ts`
Expected: FAIL because merge persistence helpers do not exist yet

- [ ] **Step 3: Extend guest types for merge results**

Update `src/server/guest/guest-types.ts` with:
- `MergeGuestSessionInput`
- `MergeGuestSessionResult`

- [ ] **Step 4: Implement repository helpers**

Add focused helpers in `src/server/guest/guest-repository.ts`:
- `assignGuestChatsToUser`
- `markGuestSessionMerged`
- `mergeGuestSessionIntoUser`

Keep the final helper transactional via `prisma.$transaction`.

- [ ] **Step 5: Run the focused repository test to verify it passes**

Run: `npm test -- src/server/guest/guest-repository.test.ts`
Expected: PASS

## Task 2: Add Guest Merge Service Rules

**Files:**
- Modify: `src/server/guest/guest-service.ts`
- Modify: `src/server/guest/guest-service.test.ts`

- [ ] **Step 1: Write failing guest service tests for merge**

Cover:
- detecting a mergeable guest session from a guest token
- rejecting merge when the guest token is missing
- rejecting merge when the guest session is expired or already merged
- merging guest chats into a verified user

- [ ] **Step 2: Run the focused service test to verify it fails**

Run: `npm test -- src/server/guest/guest-service.test.ts`
Expected: FAIL because merge service helpers do not exist yet

- [ ] **Step 3: Implement merge detection and merge execution**

Add service helpers:
- `getMergeableGuestSession(guestToken?: string | null)`
- `mergeGuestSessionIntoUserAccount(input)`

Rules:
- only active, unmerged guest sessions are mergeable
- merge returns the merged guest session id plus transferred chat count
- service should not read cookies directly; it should receive guest token or session id from the caller

- [ ] **Step 4: Run the focused service test to verify it passes**

Run: `npm test -- src/server/guest/guest-service.test.ts`
Expected: PASS

## Task 3: Add Merge Route

**Files:**
- Create: `src/app/api/guest/merge/route.ts`
- Create: `src/app/api/guest/merge/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Cover:
- verified authenticated user can merge current guest history
- unverified authenticated user gets `403`
- missing session gets `401`
- missing or stale guest token gets `401`

- [ ] **Step 2: Run the focused route test to verify it fails**

Run: `npm test -- src/app/api/guest/merge/route.test.ts`
Expected: FAIL because the merge route does not exist yet

- [ ] **Step 3: Implement `POST /api/guest/merge`**

Flow:
- resolve current user session from auth cookie
- require verified user
- resolve guest token from guest cookie
- call `mergeGuestSessionIntoUserAccount`
- return `{ success: true, mergedChatCount }`

- [ ] **Step 4: Run the focused route test to verify it passes**

Run: `npm test -- src/app/api/guest/merge/route.test.ts`
Expected: PASS

## Task 4: Surface Merge Candidate in Bootstrap Payloads

**Files:**
- Modify: `src/server/page/home-data.ts`
- Modify: `src/server/page/home-data.test.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/session/route.test.ts`

- [ ] **Step 1: Write failing tests for merge-candidate detection**

Cover:
- home-data includes a merge candidate for verified authenticated users with a valid guest cookie
- home-data does not expose merge candidate for unverified users
- auth-session route includes merge candidate in the authenticated payload

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:
- `npm test -- src/server/page/home-data.test.ts`
- `npm test -- src/app/api/auth/session/route.test.ts`

Expected: FAIL because merge-candidate fields do not exist yet

- [ ] **Step 3: Extend payload shapes**

Add a small merge-candidate payload with:
- `guestSessionId`
- `trialMessageCount`

- [ ] **Step 4: Implement merge detection in bootstrap/session**

Only expose the candidate when:
- user session exists
- user is verified
- guest cookie exists
- guest session is active and not merged

- [ ] **Step 5: Run the focused tests to verify they pass**

Run the two commands from Step 2 again
Expected: PASS

## Task 5: Add Merge Prompt to the Client

**Files:**
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`

- [ ] **Step 1: Write failing client tests**

Cover:
- verified authenticated users see a merge prompt when `mergeCandidate` exists
- clicking merge calls `POST /api/guest/merge`
- successful merge refreshes or rehydrates the workspace
- clicking “not now” hides the prompt locally

- [ ] **Step 2: Run the focused client test to verify it fails**

Run: `npm test -- src/components/chat-app.test.tsx`
Expected: FAIL because the merge prompt UI does not exist yet

- [ ] **Step 3: Implement merge prompt state and actions**

Add:
- local state for `mergeCandidate`
- `handleMergeGuestHistory()`
- `dismissMergePrompt()`

Prefer a full page reload after successful merge so server bootstrap becomes the source of truth for the merged chat list.

- [ ] **Step 4: Run the focused client test to verify it passes**

Run: `npm test -- src/components/chat-app.test.tsx`
Expected: PASS

## Task 6: Full Verification and Learning Doc

**Files:**
- Modify: any of the above if verification finds gaps
- Create: `docs/superpowers/specs/2026-04-09-guest-history-merge-learning.md`

- [ ] **Step 1: Run targeted verification**

Run:
- `npm test -- src/server/guest/guest-repository.test.ts`
- `npm test -- src/server/guest/guest-service.test.ts`
- `npm test -- src/app/api/guest/merge/route.test.ts`
- `npm test -- src/server/page/home-data.test.ts`
- `npm test -- src/app/api/auth/session/route.test.ts`
- `npm test -- src/components/chat-app.test.tsx`

Expected: PASS

- [ ] **Step 2: Run full verification**

Run:
- `npm test`
- `npx prisma validate`

Expected: PASS

- [ ] **Step 3: Write the learning document**

Create `docs/superpowers/specs/2026-04-09-guest-history-merge-learning.md` in the same explanatory style as the previous guest-session learning document, covering:
- what merge solves
- why verification and merge are intentionally decoupled
- the request-to-service-to-repository call chain
- where the real ownership transfer happens
- how `mergedAt` changes later behavior
