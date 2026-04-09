# Guest Session and Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-backed guest identity with trial-limited chat access so anonymous users can keep their own history across refreshes without weakening the authenticated ownership model built in Phase 1.

**Architecture:** Keep the existing `route -> service -> repository` layering, add a parallel `guest` server module for guest cookie/session lifecycle, and refactor chat ownership from `user-only` into a strict `user xor guestSession` model. Let the homepage bootstrap and `/api/auth/session` surface either an authenticated user or a guest viewer state, while `POST /api/chat` enforces guest trial limits on the server before creating or continuing conversations.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7, PostgreSQL, Vitest, Testing Library, Zod, Web Cookies API

---

## Execution Status

- Status: Completed on `2026-04-08`
- Completed scope: Task 1 through Task 5
- Verification run:
  - `npm test`
  - `npx prisma validate`
- Commit status:
  - Intentionally not committed in this session, per user instruction
  - Changes are left in the worktree and staged at the end for review

## What Landed

- Added a persistent `GuestSession` data model plus `user xor guestSession` ownership in Prisma and chat persistence.
- Added guest cookie/session service helpers with server-side quota enforcement.
- Refactored chat repository/service ownership from `userId` into `ChatOwner`.
- Exposed guest viewer state through homepage bootstrap, `/api/auth/session`, and `/api/chat`.
- Added guest UI behavior for trial remaining, quota exhaustion, and upgrade/login CTA flows.
- Tightened guest quota ordering so quota is checked before expensive work and only consumed after the user message is persisted.
- Follow-up adjustment on `2026-04-09`: anonymous homepage loads now return a guest preview state without eagerly creating `GuestSession`; actual guest session creation happens only in cookie-writing routes such as `/api/chat` and `/api/auth/session`.

## Scope Slice

The source spec at `docs/superpowers/specs/2026-04-02-auth-and-guest-trial-design.md` covers three distinct subsystems:

1. guest identity and quota
2. email verification
3. guest-history merge after verification

This plan intentionally covers only subsystem `1`. That keeps the next implementation slice small enough to test and ship cleanly. Email verification and merge should be planned separately after this slice lands.

## File Map

- Create: `src/server/guest/guest-types.ts`
- Create: `src/server/guest/guest-session.ts`
- Create: `src/server/guest/guest-repository.ts`
- Create: `src/server/guest/guest-repository.test.ts`
- Create: `src/server/guest/guest-service.ts`
- Create: `src/server/guest/guest-service.test.ts`
- Modify: `prisma/schema.prisma`
- Modify: `src/server/chat/chat-types.ts`
- Modify: `src/server/chat/chat-repository.ts`
- Modify: `src/server/chat/chat-repository.test.ts`
- Modify: `src/server/chat/chat-service.ts`
- Modify: `src/server/chat/chat-service.test.ts`
- Modify: `src/server/page/home-data.ts`
- Modify: `src/server/page/home-data.test.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/session/route.test.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/chat/route.test.ts`
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`

## Target Behavior

- Anonymous visitor gets a stable `guest` identity via `httpOnly` cookie.
- Guest refreshes page and still sees the same chats and remaining trial state.
- Guest can send up to a fixed number of messages, suggested initial limit: `3`.
- Once guest quota is exhausted:
  - history remains readable
  - sending is blocked by the server
  - UI clearly asks the user to register or log in
- Logged-in users continue to work exactly as Phase 1 already does.
- Authenticated users still take precedence over guests when both cookies are present.

## Task 1: Add Guest Session Data Model and Persistence

**Files:**
- Create: `src/server/guest/guest-types.ts`
- Create: `src/server/guest/guest-repository.ts`
- Create: `src/server/guest/guest-repository.test.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Write failing guest repository tests**

Create `src/server/guest/guest-repository.test.ts` covering:

```ts
it("creates a guest session with token and expiry", async () => {});
it("finds a guest session by token", async () => {});
it("increments trialMessageCount", async () => {});
it("returns chats scoped by guestSessionId after schema refactor", async () => {});
```

- [ ] **Step 2: Run the guest repository tests to verify they fail**

Run: `npm test -- src/server/guest/guest-repository.test.ts`
Expected: FAIL because the guest repository module and Prisma guest model do not exist yet

- [ ] **Step 3: Extend Prisma schema for guest ownership**

Update `prisma/schema.prisma` to add:

```prisma
model GuestSession {
  id                String   @id @default(cuid())
  guestToken        String   @unique
  trialMessageCount Int      @default(0)
  mergedAt          DateTime? @db.Timestamptz(3)
  expiresAt         DateTime @db.Timestamptz(3)
  createdAt         DateTime @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime @default(now()) @db.Timestamptz(3)
  chats             Chat[]
}

model Chat {
  userId         String?
  guestSessionId String?
}
```

Also add:
- relation from `Chat` to `GuestSession`
- keep relation to `User`, but make `userId` optional
- add `@@index([guestSessionId, updatedAt])`
- add a migration-level `CHECK` constraint enforcing `user xor guestSession`

- [ ] **Step 4: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_guest_sessions_and_chat_owner_xor`
Expected:
- migration file created under `prisma/migrations/...`
- Prisma client regenerates successfully

- [ ] **Step 5: Add guest persistence types**

Implement `src/server/guest/guest-types.ts`:

```ts
export type GuestSessionRecord = {
  id: string;
  guestToken: string;
  trialMessageCount: number;
  mergedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateGuestSessionInput = {
  guestToken: string;
  expiresAt: Date;
};
```

- [ ] **Step 6: Implement the guest repository**

Implement `src/server/guest/guest-repository.ts` with focused functions:
- `createGuestSession`
- `findGuestSessionByToken`
- `incrementGuestTrialCount`
- `deleteGuestSessionByToken` only if later cleanup is needed in service logic

- [ ] **Step 7: Run the guest repository tests to verify they pass**

Run: `npm test -- src/server/guest/guest-repository.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/guest/guest-types.ts src/server/guest/guest-repository.ts src/server/guest/guest-repository.test.ts
git commit -m "feat: add guest session persistence"
```

## Task 2: Add Guest Cookie and Guest Session Service

**Files:**
- Create: `src/server/guest/guest-session.ts`
- Create: `src/server/guest/guest-service.ts`
- Create: `src/server/guest/guest-service.test.ts`

- [ ] **Step 1: Write failing guest service tests**

Create `src/server/guest/guest-service.test.ts` covering:

```ts
it("creates a guest session when no guest cookie is present", async () => {});
it("returns the existing guest session when token is valid", async () => {});
it("recreates a guest session when the token is expired", async () => {});
it("increments guest trial count after a successful guest message", async () => {});
```

- [ ] **Step 2: Run the guest service tests to verify they fail**

Run: `npm test -- src/server/guest/guest-service.test.ts`
Expected: FAIL because the guest session helpers and service do not exist yet

- [ ] **Step 3: Add guest cookie helpers**

Implement `src/server/guest/guest-session.ts` with:
- `createGuestToken()`
- `getGuestCookieName()`
- `getGuestExpiresAt()`
- `getGuestCookieOptions()`
- `readGuestTokenFromCookieHeader(cookieHeader?: string | null)`

Suggested constants:

```ts
const GUEST_TTL_DAYS = 14;
const GUEST_COOKIE_NAME = "ai-chat-guest";
```

- [ ] **Step 4: Implement the guest service**

Implement `src/server/guest/guest-service.ts` with:
- `getCurrentGuestSession(guestToken?: string | null)`
- `getOrCreateGuestSession(guestToken?: string | null)`
- `consumeGuestMessageQuota(guestSessionId: string)`

Rules:
- expired guest session returns `null`
- `getOrCreateGuestSession` returns `{ guestSession, created: boolean }`
- quota increment happens only after a guest message is accepted

- [ ] **Step 5: Add a shared guest limit constant**

Inside `guest-service.ts` or `guest-types.ts`, define:

```ts
export const GUEST_MESSAGE_LIMIT = 3;
```

Keep it in one place so route handlers, page bootstrap, and the client can all derive UI state from the same limit.

- [ ] **Step 6: Run the guest service tests to verify they pass**

Run: `npm test -- src/server/guest/guest-service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/guest/guest-session.ts src/server/guest/guest-service.ts src/server/guest/guest-service.test.ts
git commit -m "feat: add guest session service"
```

## Task 3: Refactor Chat Ownership to Support User or Guest

**Files:**
- Modify: `src/server/chat/chat-types.ts`
- Modify: `src/server/chat/chat-repository.ts`
- Modify: `src/server/chat/chat-repository.test.ts`
- Modify: `src/server/chat/chat-service.ts`
- Modify: `src/server/chat/chat-service.test.ts`

- [ ] **Step 1: Write failing chat tests for guest ownership**

Add tests covering:
- `listChatSummaries` works for guest owner
- `loadChatMessages` works for guest owner
- guest `POST /api/chat` creates a chat with `guestSessionId`
- guest quota exhaustion blocks new messages

Use or extend:
- `src/server/chat/chat-repository.test.ts`
- `src/server/chat/chat-service.test.ts`

- [ ] **Step 2: Run the chat-focused tests to verify they fail**

Run:
- `npm test -- src/server/chat/chat-repository.test.ts`
- `npm test -- src/server/chat/chat-service.test.ts`

Expected: FAIL because chat ownership is still `userId`-only

- [ ] **Step 3: Add a chat owner union**

Update `src/server/chat/chat-types.ts` to add a strict union:

```ts
export type ChatOwner =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestSessionId: string };
```

Update `ChatRecord` to allow both nullable owner columns:

```ts
export type ChatRecord = {
  id: string;
  title: string;
  userId: string | null;
  guestSessionId: string | null;
};
```

- [ ] **Step 4: Refactor chat repository functions to accept `ChatOwner`**

Change signatures such as:
- `listChats(owner: ChatOwner)`
- `getChatMessages(chatId: string, owner: ChatOwner)`
- `getConversationMessages(chatId: string, owner: ChatOwner)`
- `getChatById(chatId: string, owner: ChatOwner)`
- `createChat(title: string, owner: ChatOwner)`

Repository where clause pattern:

```ts
const ownerWhere =
  owner.kind === "user"
    ? { userId: owner.userId }
    : { guestSessionId: owner.guestSessionId };
```

- [ ] **Step 5: Refactor chat service functions to accept `ChatOwner`**

Change service signatures to:
- `listChatSummaries(owner: ChatOwner)`
- `loadChatMessages(owner: ChatOwner, chatId: string)`
- `renameChat(owner: ChatOwner, chatId: string, title: string)`
- `deleteChatById(owner: ChatOwner, chatId: string)`
- `prepareChatReply({ owner, chatId, message })`

Important detail:
- `assertChatOwner` still stays useful, but it must check against the owner union instead of only `userId`

- [ ] **Step 6: Add guest quota enforcement in the service or route boundary**

For guest requests:
- block when `trialMessageCount >= GUEST_MESSAGE_LIMIT`
- return a dedicated error message, for example:

```ts
"Guest trial limit reached. Please register to continue."
```

Keep this as a typed, expected business error rather than a generic `500`.

- [ ] **Step 7: Run the chat-focused tests to verify they pass**

Run:
- `npm test -- src/server/chat/chat-repository.test.ts`
- `npm test -- src/server/chat/chat-service.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/chat/chat-types.ts src/server/chat/chat-repository.ts src/server/chat/chat-repository.test.ts src/server/chat/chat-service.ts src/server/chat/chat-service.test.ts
git commit -m "feat: support guest-owned chats"
```

## Task 4: Expose Guest State Through Server Bootstrap and Route Handlers

**Files:**
- Modify: `src/server/page/home-data.ts`
- Modify: `src/server/page/home-data.test.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/session/route.test.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/chat/route.test.ts`

- [ ] **Step 1: Write failing tests for guest bootstrap and guest route behavior**

Add tests covering:
- homepage bootstrap returns guest identity when no auth session exists
- `/api/auth/session` returns guest state for anonymous visitor with guest cookie
- `/api/chat` creates/uses guest chats when only guest cookie is present
- guest trial exhaustion returns a stable non-500 response

- [ ] **Step 2: Run the route and page tests to verify they fail**

Run:
- `npm test -- src/server/page/home-data.test.ts`
- `npm test -- src/app/api/auth/session/route.test.ts`
- `npm test -- src/app/api/chat/route.test.ts`

Expected: FAIL because server bootstrap and routes still assume `signed out = no actor`

- [ ] **Step 3: Extend homepage bootstrap data shape**

Update `src/server/page/home-data.ts` types to include guest-facing state:

```ts
type ViewerKind = "user" | "guest";

export type HomePageData = {
  viewerKind: ViewerKind;
  isAuthenticated: boolean;
  currentUser: HomePageUser | null;
  guestSession: {
    id: string;
    trialMessageCount: number;
    messageLimit: number;
  } | null;
  initialChats: HomePageChatSummary[];
  initialMessages: HomePageChatMessage[];
  initialChatId: string | null;
};
```

Rules:
- authenticated user still takes precedence over guest
- when no auth session exists, bootstrap should recover or create a guest session
- guest bootstrap should preload guest-owned chat list and selected chat messages

- [ ] **Step 4: Update `/api/auth/session` to surface guest state**

Return shape should become:

```ts
{
  authenticated: boolean;
  user: AuthUserSummary | null;
  guest: {
    active: boolean;
    trialMessageCount: number;
    messageLimit: number;
  } | null;
}
```

- [ ] **Step 5: Update `/api/chat` route ownership resolution**

Refactor route flow to:
- resolve authenticated user first
- otherwise resolve guest session from guest cookie
- if neither exists, create/recover guest session for `GET` bootstrap-compatible flows and `POST`
- map guest trial exhaustion to a stable expected status, recommended: `403`

Suggested error contract:

```ts
return NextResponse.json(
  { error: "Guest trial limit reached. Please register to continue." },
  { status: 403 },
);
```

- [ ] **Step 6: Ensure guest cookie gets written on first guest request**

For the first guest visit:
- `/api/chat` and `/api/auth/session` may need to set the guest cookie if a session had to be created
- `home-data.ts` cannot write cookies, so the first writable route response must finish the setup

Document this behavior in comments so the next implementation slice does not accidentally break it.

- [ ] **Step 7: Run the route and page tests to verify they pass**

Run:
- `npm test -- src/server/page/home-data.test.ts`
- `npm test -- src/app/api/auth/session/route.test.ts`
- `npm test -- src/app/api/chat/route.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/page/home-data.ts src/server/page/home-data.test.ts src/app/api/auth/session/route.ts src/app/api/auth/session/route.test.ts src/app/api/chat/route.ts src/app/api/chat/route.test.ts
git commit -m "feat: expose guest identity in server routes"
```

## Task 5: Add Guest UI, Trial Messaging, and Read-Only Exhaustion State

**Files:**
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`

- [ ] **Step 1: Write failing component tests for guest mode**

Add tests covering:
- guest shell renders as usable chat workspace, not as forced login shell
- guest can send messages until quota is exhausted
- quota exhausted keeps history visible and disables send
- quota exhausted shows a register/login prompt instead of generic failure
- authenticated users still see the existing account-first shell

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `npm test -- src/components/chat-app.test.tsx`
Expected: FAIL because the client currently treats every unauthenticated state as "must log in before chatting"

- [ ] **Step 3: Extend `ChatApp` props and local state for guest mode**

Refactor `ChatApp` to derive behavior from `viewerKind` and `guestSession` rather than only `isAuthenticated`.

Suggested local checks:

```ts
const isGuest = initialData.viewerKind === "guest";
const guestMessagesUsed = initialData.guestSession?.trialMessageCount ?? 0;
const guestMessagesRemaining = Math.max(
  0,
  (initialData.guestSession?.messageLimit ?? 0) - guestMessagesUsed,
);
const isGuestQuotaExhausted = isGuest && guestMessagesRemaining === 0;
```

- [ ] **Step 4: Replace the signed-out composer lock with guest-aware behavior**

Behavior:
- guest with remaining quota can type and send
- guest with exhausted quota sees read-only history and disabled send button
- `401` remains the authenticated-session-expired path
- guest limit rejection should map to explicit guest CTA, not to the login-expired UI

- [ ] **Step 5: Add guest-specific copy**

Suggested UI copy:
- active guest: `游客试用还剩 2 次`
- exhausted guest: `游客试用次数已用完，注册后可继续聊天并保存历史`

Keep these strings close to the component for now; do not add a broader i18n layer in this slice.

- [ ] **Step 6: Run the component tests to verify they pass**

Run: `npm test -- src/components/chat-app.test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/chat-app.tsx src/components/chat-app.test.tsx
git commit -m "feat: add guest trial chat experience"
```

## Final Verification Checklist

- [x] Guest first visit creates or restores a guest identity without logging in
- [x] Guest refresh keeps the same chats and quota
- [x] Guest can read history after quota exhaustion
- [x] Guest cannot send after quota exhaustion
- [x] Authenticated users continue to use Phase 1 flow without regression
- [x] `npm test` passes before completion

## Next Plan After This One

After this slice lands, write a follow-up plan for:

1. `emailVerifiedAt` on `User`
2. verification token model and routes
3. post-login detection of mergeable guest history
4. `POST /api/guest/merge`
