# Account Entry Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add discoverable `/account` and `/settings` entry points to the authenticated workspace header while keeping verified-only settings access visually explicit for unverified users.

**Architecture:** Modify the existing `ChatApp` header action area instead of introducing a new global nav. Verified users get clickable `Account` and `Settings` links plus logout. Unverified users get `Account`, a disabled-looking `Settings` pill, and a short helper message. Guests keep the existing login/register actions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File Map

- Create: `docs/superpowers/specs/2026-04-10-account-entry-navigation-design.md`
- Create: `docs/superpowers/specs/2026-04-10-account-entry-navigation-learning.md`
- Create: `docs/superpowers/plans/2026-04-10-account-entry-navigation-implementation.md`
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`
- Modify: `progress.md`

## Task 1: Add Header Navigation Tests

**Files:**
- Modify: `src/components/chat-app.test.tsx`

- [ ] **Step 1: Write failing tests**

Cover:
- verified users see `Account` and `Settings` links
- unverified users see `Account` plus a disabled `Settings` affordance and helper text
- guest users do not see `Account` or `Settings`

- [ ] **Step 2: Run the focused chat-app test to verify it fails**

Run: `npm test -- src/components/chat-app.test.tsx`
Expected: FAIL because the header does not expose those navigation affordances yet

- [ ] **Step 3: Implement minimal header navigation**

Update `src/components/chat-app.tsx` so the authenticated header action row renders:
- `Account` link for all authenticated users
- `Settings` link only when verified
- disabled-style `Settings` pill + helper text when unverified
- existing logout button

- [ ] **Step 4: Run the focused chat-app test to verify it passes**

Run: `npm test -- src/components/chat-app.test.tsx`
Expected: PASS

## Task 2: Verify The Slice

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run adjacent protected-page tests**

Run:
- `npm test -- src/app/account/page.test.tsx`
- `npm test -- src/app/settings/page.test.tsx`

Expected: PASS

- [ ] **Step 2: Run repository quality checks**

Run:
- `npm run lint`
- `npm run build`

Expected:
- no new lint errors introduced by navigation work
- build succeeds

- [ ] **Step 3: Update progress log**

Record:
- what navigation was added
- how verified versus unverified states differ
- verification commands and outcomes
