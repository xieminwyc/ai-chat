# Protected Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimal `/account` and `/settings` pages that consume the shared auth entry-state helpers and enforce `authenticated` versus `verified` access on the server.

**Architecture:** Keep both routes as App Router Server Component pages. Each page reads cookies, resolves the current entry state, checks access with `resolveProtectedPageAccess()`, redirects to `/` when blocked, and otherwise renders a tiny status-focused page. Tests mock the page dependencies so they stay focused on access behavior rather than low-level cookie parsing.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library

---

## File Map

- Create: `src/app/account/page.tsx`
- Create: `src/app/account/page.test.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/page.test.tsx`
- Modify: `progress.md`

## Task 1: Add `/account` Protected Page

**Files:**
- Create: `src/app/account/page.tsx`
- Create: `src/app/account/page.test.tsx`

- [ ] **Step 1: Write the failing `/account` page tests**

Cover:
- redirects to `/` when access is not allowed
- renders user id, email, and verification state for `authenticated_unverified`
- renders verified state for `authenticated_verified`

- [ ] **Step 2: Run the focused `/account` test to verify it fails**

Run: `npm test -- src/app/account/page.test.tsx`
Expected: FAIL because the page does not exist yet

- [ ] **Step 3: Implement the `/account` page**

Create a Server Component page that:
- awaits `cookies()`
- resolves entry state from the cookie store
- checks `resolveProtectedPageAccess(state, "authenticated")`
- calls `redirect("/")` when blocked
- renders a minimal account summary when allowed

- [ ] **Step 4: Run the focused `/account` test to verify it passes**

Run: `npm test -- src/app/account/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/account/page.tsx src/app/account/page.test.tsx
git commit -m "feat: add authenticated account page"
```

## Task 2: Add `/settings` Verified Page

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/page.test.tsx`

- [ ] **Step 1: Write the failing `/settings` page tests**

Cover:
- redirects to `/` when signed out
- redirects to `/` for `authenticated_unverified`
- renders the settings placeholder for `authenticated_verified`

- [ ] **Step 2: Run the focused `/settings` test to verify it fails**

Run: `npm test -- src/app/settings/page.test.tsx`
Expected: FAIL because the page does not exist yet

- [ ] **Step 3: Implement the `/settings` page**

Create a Server Component page that:
- awaits `cookies()`
- resolves entry state from the cookie store
- checks `resolveProtectedPageAccess(state, "verified")`
- calls `redirect("/")` when blocked
- renders a minimal verified-only settings placeholder when allowed

- [ ] **Step 4: Run the focused `/settings` test to verify it passes**

Run: `npm test -- src/app/settings/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/page.tsx src/app/settings/page.test.tsx
git commit -m "feat: add verified settings page"
```

## Task 3: Verify The Slice

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run both new page tests together**

Run: `npm test -- src/app/account/page.test.tsx src/app/settings/page.test.tsx`
Expected: PASS

- [ ] **Step 2: Run adjacent auth regression tests**

Run:
- `npm test -- src/server/auth/entry-state.test.ts`
- `npm test -- src/app/api/auth/session/route.test.ts`

Expected: PASS

- [ ] **Step 3: Run repository quality checks**

Run:
- `npm run lint`
- `npm run build`

Expected:
- no new lint errors from this slice
- build succeeds with the new pages

- [ ] **Step 4: Update progress log**

Record:
- protected pages added
- verification commands and outcomes
- any residual warning or follow-up

- [ ] **Step 5: Commit**

```bash
git add progress.md
git commit -m "docs: record protected pages progress"
```
