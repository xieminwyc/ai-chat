# Entry State And Page Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared server-side entry-state module so homepage bootstrap and `/api/auth/session` consume the same identity-entry rules, while exposing reusable `authenticated` and `verified` page-protection helpers for future pages.

**Architecture:** Introduce a focused `entry-state` module in the auth server layer that resolves the current request into one of five explicit entry states without throwing route-level errors. Keep homepage bootstrap in read-only mode so `/` still does not auto-create guest sessions, but let `/api/auth/session` reuse the same resolved state and only perform guest-session creation as a follow-up when the resolved state is `signed_out_guest_preview`. Add lightweight access helpers in the same module for future page guards; do not introduce `proxy.ts` in this slice.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Vitest, Web Cookies API

---

## Scope Slice

This plan intentionally covers one subsystem:

- unify entry-state resolution for homepage bootstrap and auth session payloads

This plan also includes a small future-facing seam:

- reusable page-protection helpers for `authenticated` and `verified` page requirements

This plan does **not** include:

- creating `proxy.ts`
- changing `POST /api/chat` or other action-route authorization rules
- adding new protected pages such as `/account` or `/settings`

## File Map

- Create: `src/server/auth/entry-state.ts`
- Create: `src/server/auth/entry-state.test.ts`
- Modify: `src/server/page/home-data.ts`
- Modify: `src/server/page/home-data.test.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/session/route.test.ts`

## Design Constraints To Preserve

- Homepage `/` must remain read-only about guest state:
  - no guest cookie => guest preview
  - stale guest cookie => guest preview
  - auth-shell cookie => signed-out auth shell
- `/api/auth/session` may still create a guest session when the request resolves to `signed_out_guest_preview`
- verified authenticated users may surface `mergeCandidate`
- unverified authenticated users must remain authenticated, but must not receive `mergeCandidate`
- route and service authorization for mutations stay where they are today

## Target Behavior

- A shared entry-state resolver produces one of:
  - `signed_out_guest_preview`
  - `signed_out_guest_workspace`
  - `signed_out_auth_shell`
  - `authenticated_unverified`
  - `authenticated_verified`
- The resolver also returns normalized `user`, `guestSession`, and `mergeCandidate` data for consumers.
- Homepage bootstrap uses the shared resolver and preserves current output behavior.
- `/api/auth/session` uses the shared resolver and preserves current response behavior, including guest activation only when still needed.
- A shared access helper can answer whether a future page requiring `authenticated` or `verified` access should allow or redirect.

## Task 1: Add Shared Entry-State Module

**Files:**
- Create: `src/server/auth/entry-state.ts`
- Create: `src/server/auth/entry-state.test.ts`

- [ ] **Step 1: Write failing entry-state tests**

Cover at least:
- resolves `authenticated_verified` with `mergeCandidate` when a verified session and mergeable guest token coexist
- resolves `authenticated_unverified` without `mergeCandidate`
- resolves `signed_out_auth_shell` when no session exists and auth-shell cookie is present
- resolves `signed_out_guest_workspace` when a current guest session exists
- resolves `signed_out_guest_preview` when no valid guest session exists
- access helper allows `authenticated` pages only for authenticated states
- access helper allows `verified` pages only for `authenticated_verified`

- [ ] **Step 2: Run the focused entry-state test to verify it fails**

Run: `npm test -- src/server/auth/entry-state.test.ts`
Expected: FAIL because `entry-state.ts` does not exist yet

- [ ] **Step 3: Implement the shared entry-state resolver**

Create `src/server/auth/entry-state.ts` with:
- explicit entry-state discriminated union types
- a shared resolver that accepts normalized request identity inputs:
  - session token or authenticated session
  - guest token
  - auth-shell preference
- read-only behavior for guest resolution:
  - invalid, expired, or merged guest => preview state, not thrown error
- merge-candidate resolution only for verified authenticated users

Recommended public exports:

```ts
export type EntryStateKind =
  | "signed_out_guest_preview"
  | "signed_out_guest_workspace"
  | "signed_out_auth_shell"
  | "authenticated_unverified"
  | "authenticated_verified";

export async function resolveEntryStateFromCookieHeader(cookieHeader?: string | null): Promise<EntryState>;

export async function resolveEntryStateFromCookieStore(
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>>,
): Promise<EntryState>;

export function resolveProtectedPageAccess(
  state: EntryState,
  requirement: "authenticated" | "verified",
): { allowed: boolean; redirectTo: "/" | null };
```

Keep the resolver small and composable. If header-based and cookie-store-based readers need shared plumbing, hide it behind a single internal helper instead of duplicating logic.

- [ ] **Step 4: Run the focused entry-state test to verify it passes**

Run: `npm test -- src/server/auth/entry-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/entry-state.ts src/server/auth/entry-state.test.ts
git commit -m "feat: add shared auth entry state resolver"
```

## Task 2: Refactor Homepage Bootstrap To Consume Entry State

**Files:**
- Modify: `src/server/page/home-data.ts`
- Modify: `src/server/page/home-data.test.ts`

- [ ] **Step 1: Rewrite failing homepage tests around entry-state consumption**

Adjust `src/server/page/home-data.test.ts` so it verifies:
- guest preview still returns no guest session and no initial chats
- signed-out auth shell still returns authenticated false and user viewer shell state
- guest workspace still loads guest-owned chats from resolved guest session
- authenticated verified state still loads user-owned chats and preserves merge candidate
- authenticated unverified state still loads user-owned chats but does not expose merge candidate

Mock the new entry-state module instead of re-mocking all lower-level guest/session branching in every test.

- [ ] **Step 2: Run the focused homepage test to verify it fails**

Run: `npm test -- src/server/page/home-data.test.ts`
Expected: FAIL because `home-data.ts` still computes entry state internally

- [ ] **Step 3: Refactor homepage bootstrap**

Update `src/server/page/home-data.ts` to:
- call `resolveEntryStateFromCookieStore()`
- keep `serializeUser`, `serializeChat`, and `serializeMessage`
- translate entry states into `HomePageData`
- keep guest preview read-only
- keep guest workspace chat loading for `signed_out_guest_workspace`
- keep authenticated chat loading for both authenticated states

Recommended translation rules:
- `signed_out_guest_preview` => existing guest preview payload
- `signed_out_auth_shell` => existing signed-out auth shell payload
- `signed_out_guest_workspace` => existing guest workspace payload
- `authenticated_unverified` => authenticated payload with `mergeCandidate: null`
- `authenticated_verified` => authenticated payload with possible `mergeCandidate`

- [ ] **Step 4: Run the focused homepage test to verify it passes**

Run: `npm test -- src/server/page/home-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/page/home-data.ts src/server/page/home-data.test.ts
git commit -m "refactor: derive homepage bootstrap from entry state"
```

## Task 3: Refactor Auth Session Route To Consume Entry State

**Files:**
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/session/route.test.ts`

- [ ] **Step 1: Rewrite failing auth-session tests around entry-state consumption**

Cover:
- authenticated verified payload still includes `user` and optional `mergeCandidate`
- authenticated unverified payload still includes `user` but no `mergeCandidate`
- signed-out auth shell still returns `{ authenticated: false, user: null, guest: null }`
- signed-out guest workspace still returns current guest counters without creating a new guest
- signed-out guest preview still creates a guest session and sets the guest cookie

- [ ] **Step 2: Run the focused auth-session test to verify it fails**

Run: `npm test -- src/app/api/auth/session/route.test.ts`
Expected: FAIL because the route still contains its own branching logic

- [ ] **Step 3: Refactor `/api/auth/session`**

Update `src/app/api/auth/session/route.ts` to:
- resolve entry state from the cookie header first
- translate authenticated and signed-out-auth-shell states directly into response payloads
- translate `signed_out_guest_workspace` directly into guest payloads
- only call `getOrCreateGuestSession()` when the shared entry state resolves to `signed_out_guest_preview`
- keep guest cookie write behavior only for newly created or missing-token activation cases

Do not move `getOrCreateGuestSession()` into the shared resolver; keep it as a route-level side effect so homepage remains read-only.

- [ ] **Step 4: Run the focused auth-session test to verify it passes**

Run: `npm test -- src/app/api/auth/session/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/session/route.ts src/app/api/auth/session/route.test.ts
git commit -m "refactor: derive auth session payload from entry state"
```

## Task 4: Verification And Access Helper Coverage

**Files:**
- Modify: any of the above if verification finds gaps

- [ ] **Step 1: Run targeted verification**

Run:
- `npm test -- src/server/auth/entry-state.test.ts`
- `npm test -- src/server/page/home-data.test.ts`
- `npm test -- src/app/api/auth/session/route.test.ts`

Expected: PASS

- [ ] **Step 2: Run adjacent regression tests**

Run:
- `npm test -- src/components/chat-app.test.tsx`
- `npm test -- src/app/api/chat/route.test.ts`

Expected: PASS, proving the shared entry-state refactor does not regress current UI or chat auth behavior

- [ ] **Step 3: Run repository-wide quality checks for this slice**

Run:
- `npm run lint`
- `npm run build`

Expected:
- lint has no new errors or warnings introduced by this slice
- build succeeds under Next.js 16

- [ ] **Step 4: Review for follow-up items**

Confirm these are true before calling the slice complete:
- no `proxy.ts` was introduced prematurely
- homepage still does not create guest sessions
- `/api/auth/session` still can activate a guest session from preview state
- future page-protection helper API is present and tested
- route-level authorization remains unchanged for mutations

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/entry-state.ts src/server/auth/entry-state.test.ts src/server/page/home-data.ts src/server/page/home-data.test.ts src/app/api/auth/session/route.ts src/app/api/auth/session/route.test.ts
git commit -m "feat: unify entry state and page protection helpers"
```
