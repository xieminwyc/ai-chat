# Settings Password And Security Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/settings` into a real verified-only settings page by adding a working change-password flow plus a minimal security roadmap section.

**Architecture:** Keep `/settings` as a verified-only Server Component page. Add a small client-side password form component for interactive submission and feedback. Extend the auth backend with a minimal password-change route, schema, service method, and repository update helper.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Zod, Vitest, Testing Library

---

## File Map

- Create: `docs/superpowers/specs/2026-04-10-settings-password-and-security-roadmap-design.md`
- Create: `docs/superpowers/plans/2026-04-10-settings-password-and-security-roadmap-implementation.md`
- Create: `src/app/api/auth/password/route.ts`
- Create: `src/app/api/auth/password/route.test.ts`
- Create: `src/app/settings/password-form.tsx`
- Create: `src/app/settings/password-form.test.tsx`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/server/auth/auth-schemas.ts`
- Modify: `src/server/auth/auth-service.ts`
- Modify: `src/server/auth/auth-service.test.ts`
- Modify: `src/server/auth/auth-repository.ts`
- Modify: `src/server/auth/auth-repository.test.ts`
- Modify: `progress.md`

## Task 1: Add Password Change Backend

**Files:**
- Create: `src/app/api/auth/password/route.ts`
- Create: `src/app/api/auth/password/route.test.ts`
- Modify: `src/server/auth/auth-schemas.ts`
- Modify: `src/server/auth/auth-service.ts`
- Modify: `src/server/auth/auth-service.test.ts`
- Modify: `src/server/auth/auth-repository.ts`
- Modify: `src/server/auth/auth-repository.test.ts`

- [ ] **Step 1: Write failing backend tests**

Cover:
- service rejects wrong current password
- service rejects same next password
- service updates password hash on success
- route returns 401 without session
- route returns 400 for invalid payload
- route returns 200 on success

- [ ] **Step 2: Run the focused backend tests to verify they fail**

Run:
- `npm test -- src/server/auth/auth-service.test.ts`
- `npm test -- src/app/api/auth/password/route.test.ts`

Expected: FAIL because password change behavior and route do not exist yet

- [ ] **Step 3: Implement the minimal backend**

Add:
- `changePasswordSchema`
- repository helper to update user password hash
- service method to verify current password and persist new hash
- route handler for `/api/auth/password`

- [ ] **Step 4: Run the focused backend tests to verify they pass**

Run:
- `npm test -- src/server/auth/auth-service.test.ts`
- `npm test -- src/app/api/auth/password/route.test.ts`

Expected: PASS

## Task 2: Add Settings Password UI

**Files:**
- Create: `src/app/settings/password-form.tsx`
- Create: `src/app/settings/password-form.test.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Write failing UI tests**

Cover:
- password form submits successfully and shows success feedback
- form shows API error feedback
- settings page renders password section and security roadmap

- [ ] **Step 2: Run the focused UI tests to verify they fail**

Run:
- `npm test -- src/app/settings/password-form.test.tsx`

Expected: FAIL because the form component does not exist yet

- [ ] **Step 3: Implement the minimal UI**

Build:
- a small client password form component that posts to `/api/auth/password`
- a richer settings page that renders the password form and two roadmap cards

- [ ] **Step 4: Run the focused UI tests to verify they pass**

Run:
- `npm test -- src/app/settings/password-form.test.tsx`

Expected: PASS

## Task 3: Verify The Slice

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run page regression tests**

Run:
- `npm test -- src/app/settings/password-form.test.tsx`
- `npm test -- src/app/account/page.test.tsx`

Expected: PASS

- [ ] **Step 2: Run repository quality checks**

Run:
- `npm run lint`
- `npm run build`

Expected:
- no new lint errors introduced by this slice
- build succeeds

- [ ] **Step 3: Update progress log**

Record:
- verified-only password flow landed
- roadmap cards added
- verification commands and outcomes
