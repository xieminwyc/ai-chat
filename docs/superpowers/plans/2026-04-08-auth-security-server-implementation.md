# Auth, Security, and Server Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-pass user authentication and ownership model to `AI Chat`, harden the chat API with structured validation and authorization, and move the homepage bootstrap flow onto the server so the project starts teaching real Next.js App Router server-side thinking.

**Architecture:** Keep the existing `chat route -> service -> repository` layering, add a parallel `auth route -> service -> repository` stack, and make chat operations require an authenticated actor instead of relying on globally shared data. Use a database-backed `Session` model plus an `httpOnly` session cookie for the learning phase, centralize request parsing with `zod`, and let `src/app/page.tsx` become the server entry that reads the current session and preloads initial chat data before handing control to the interactive client component.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7, PostgreSQL, Vitest, Testing Library, Zod, bcryptjs, Web Cookies API

---

## File Map

- Create: `src/server/auth/auth-types.ts`
- Create: `src/server/auth/auth-schemas.ts`
- Create: `src/server/auth/password.ts`
- Create: `src/server/auth/session.ts`
- Create: `src/server/auth/auth-repository.ts`
- Create: `src/server/auth/auth-service.ts`
- Create: `src/server/auth/auth-repository.test.ts`
- Create: `src/server/auth/auth-service.test.ts`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/register/route.test.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/login/route.test.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/logout/route.test.ts`
- Create: `src/app/api/auth/session/route.ts`
- Create: `src/app/api/auth/session/route.test.ts`
- Create: `src/server/chat/chat-schemas.ts`
- Create: `src/server/chat/chat-errors.ts`
- Create: `src/server/chat/chat-auth.ts`
- Create: `src/server/chat/chat-auth.test.ts`
- Create: `src/server/page/home-data.ts`
- Create: `src/server/page/home-data.test.ts`
- Modify: `package.json`
- Modify: `prisma/schema.prisma`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/chat/route.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`
- Modify: `src/server/chat/chat-types.ts`
- Modify: `src/server/chat/chat-repository.ts`
- Modify: `src/server/chat/chat-repository.test.ts`
- Modify: `src/server/chat/chat-service.ts`
- Modify: `src/server/chat/chat-service.test.ts`
- Modify: `.env.example`
- Modify: `README.md`

## Recommended Sequence

```text
Day 1
1. Auth data model and session basics
2. Register / login / logout / current-session routes

Day 2
3. Chat ownership and request validation
4. Error handling and permission boundaries

Day 3
5. Move page bootstrap to Server Component
6. Client component cleanup and final verification
```

## Learning Checkpoints

- Before Task 1, know the difference between authentication, session management, and authorization.
- Before Task 3, be able to explain why a `chatId` coming from the browser is never enough to trust ownership.
- Before Task 5, know that in Next.js 16:
  - `page.tsx` is a Server Component by default
  - `cookies()` is async
  - cookie writes must happen in a Route Handler or Server Function

## Task 1: Add Auth Data Model and Core Helpers

**Files:**
- Create: `src/server/auth/auth-types.ts`
- Create: `src/server/auth/auth-schemas.ts`
- Create: `src/server/auth/password.ts`
- Create: `src/server/auth/session.ts`
- Create: `src/server/auth/auth-repository.ts`
- Create: `src/server/auth/auth-repository.test.ts`
- Modify: `prisma/schema.prisma`
- Modify: `package.json`
- Modify: `.env.example`

**Learning focus:** Understand how a user becomes a stable server-recognized identity, and why the database needs both `User` and `Session` instead of just a browser-side flag.

- [ ] **Step 1: Add failing repository tests for the new auth persistence layer**

Create `src/server/auth/auth-repository.test.ts` with mocked Prisma expectations for:
- creating a user with `email` and `passwordHash`
- finding a user by email
- creating a session linked to a user
- finding a session with its user
- deleting a session by token

Use the same mocking style already used in `src/server/chat/chat-repository.test.ts`.

- [ ] **Step 2: Run the new auth repository test to verify it fails**

Run: `npm run test -- src/server/auth/auth-repository.test.ts`
Expected: FAIL because the auth repository module and Prisma schema do not exist yet

- [ ] **Step 3: Extend Prisma schema with `User` and `Session`**

Add:
- `User`
  - `id`
  - `email`
  - `passwordHash`
  - `createdAt`
  - `updatedAt`
  - relation to `Session`
  - relation to `Chat`
- `Session`
  - `id`
  - `token`
  - `userId`
  - `expiresAt`
  - `createdAt`
  - relation to `User`
  - unique index on `token`
  - index on `userId`

Also extend `Chat` with:
- `userId String`
- relation to `User`
- index on `userId, updatedAt`

For this first learning phase, make `Chat.userId` required so all existing chats become formally owned after a data migration step. Do not introduce `GuestSession` yet.

- [ ] **Step 4: Generate and apply the migration**

Run:
- `npx prisma migrate dev --name add_user_and_session_models`

Expected:
- Prisma creates a new migration
- Prisma client regenerates successfully

- [ ] **Step 5: Add auth types and schemas**

Implement:
- `src/server/auth/auth-types.ts`
  - `AuthUser`
  - `AuthSession`
  - `SessionCookieName`
- `src/server/auth/auth-schemas.ts`
  - `registerSchema`
  - `loginSchema`

Use `zod` schemas shaped like:

```ts
import { z } from "zod";

export const registerSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(1),
});
```

- [ ] **Step 6: Add password and session helpers**

Implement:
- `src/server/auth/password.ts`
  - `hashPassword(password: string)`
  - `verifyPassword(password: string, hash: string)`
- `src/server/auth/session.ts`
  - `createSessionToken()`
  - `getSessionCookieName()`
  - `getSessionCookieOptions()`

Use:
- `bcryptjs` for password hashing
- `crypto.randomUUID()` or `crypto.randomBytes()` for session token generation

- [ ] **Step 7: Add the auth repository implementation**

Implement `src/server/auth/auth-repository.ts` with focused functions:
- `createUser`
- `findUserByEmail`
- `findUserById`
- `createSessionRecord`
- `findSessionByToken`
- `deleteSessionByToken`

- [ ] **Step 8: Install the new dependencies**

Add to `package.json`:
- `zod`
- `bcryptjs`
- `@types/bcryptjs` only if the package version in use still needs it

Run:
- `npm install zod bcryptjs`

Expected: install succeeds and lockfile updates

- [ ] **Step 9: Run the focused auth repository tests**

Run: `npm run test -- src/server/auth/auth-repository.test.ts`
Expected: PASS

## Task 2: Add Auth Service and Auth Route Handlers

**Files:**
- Create: `src/server/auth/auth-service.ts`
- Create: `src/server/auth/auth-service.test.ts`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/register/route.test.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/login/route.test.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/logout/route.test.ts`
- Create: `src/app/api/auth/session/route.ts`
- Create: `src/app/api/auth/session/route.test.ts`

**Learning focus:** Learn how registration, login, logout, and current-session lookup differ, and why cookie writes belong in Route Handlers.

- [ ] **Step 1: Write failing auth service tests**

Cover these service behaviors in `src/server/auth/auth-service.test.ts`:
- register rejects duplicate email
- register hashes password before persistence
- login rejects wrong password
- login creates a session token and session record
- logout deletes the session token
- current-session lookup returns `null` when no cookie token is present

- [ ] **Step 2: Run the auth service tests to verify they fail**

Run: `npm run test -- src/server/auth/auth-service.test.ts`
Expected: FAIL because the auth service does not exist yet

- [ ] **Step 3: Implement the auth service**

Implement `src/server/auth/auth-service.ts` with functions like:
- `registerUser(input)`
- `loginUser(input)`
- `logoutUser(sessionToken)`
- `getCurrentSession(sessionToken)`

Expected service rules:
- trim and normalize email to lowercase
- hash password before insert
- never return `passwordHash` to route handlers
- return structured service results, not raw Prisma records

- [ ] **Step 4: Write failing route tests for register/login/logout/session**

Route test expectations:
- `POST /api/auth/register`
  - returns `201`
  - returns a safe user payload
- `POST /api/auth/login`
  - sets session cookie
  - returns authenticated user info
- `POST /api/auth/logout`
  - clears session cookie
  - returns success
- `GET /api/auth/session`
  - returns current user when session is valid
  - returns `authenticated: false` when session is missing

- [ ] **Step 5: Run the auth route tests to verify they fail**

Run:
- `npm run test -- src/app/api/auth/register/route.test.ts`
- `npm run test -- src/app/api/auth/login/route.test.ts`
- `npm run test -- src/app/api/auth/logout/route.test.ts`
- `npm run test -- src/app/api/auth/session/route.test.ts`

Expected: FAIL because route files do not exist yet

- [ ] **Step 6: Implement `POST /api/auth/register`**

Behavior:
- parse body with `registerSchema`
- call `registerUser`
- return:

```ts
return Response.json(
  { user: { id: user.id, email: user.email } },
  { status: 201 },
);
```

Do not auto-login here. Keep registration and login separate for clarity.

- [ ] **Step 7: Implement `POST /api/auth/login`**

Behavior:
- parse body with `loginSchema`
- call `loginUser`
- set session cookie with:
  - `httpOnly: true`
  - `sameSite: "lax"`
  - `secure: process.env.NODE_ENV === "production"`
  - `path: "/"`
- return current user info

- [ ] **Step 8: Implement `POST /api/auth/logout` and `GET /api/auth/session`**

`logout`:
- read cookie token
- delete session record if present
- expire the cookie

`session`:
- read cookie token
- return authenticated user payload or `authenticated: false`

- [ ] **Step 9: Run auth tests**

Run:
- `npm run test -- src/server/auth/auth-service.test.ts`
- `npm run test -- src/app/api/auth/register/route.test.ts`
- `npm run test -- src/app/api/auth/login/route.test.ts`
- `npm run test -- src/app/api/auth/logout/route.test.ts`
- `npm run test -- src/app/api/auth/session/route.test.ts`

Expected: PASS

## Task 3: Enforce Chat Ownership and Add Structured Request Validation

**Files:**
- Create: `src/server/chat/chat-schemas.ts`
- Create: `src/server/chat/chat-errors.ts`
- Create: `src/server/chat/chat-auth.ts`
- Create: `src/server/chat/chat-auth.test.ts`
- Modify: `src/server/chat/chat-types.ts`
- Modify: `src/server/chat/chat-repository.ts`
- Modify: `src/server/chat/chat-repository.test.ts`
- Modify: `src/server/chat/chat-service.ts`
- Modify: `src/server/chat/chat-service.test.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/chat/route.test.ts`

**Learning focus:** Learn why authorization belongs on the server and why route parsing should use schemas instead of ad-hoc `trim()` checks.

- [ ] **Step 1: Write failing chat auth tests**

Add `src/server/chat/chat-auth.test.ts` for helpers such as:
- `requireAuthenticatedUser` throws when there is no current user
- `assertChatOwner` rejects chats owned by another user
- `assertChatOwner` allows access when `chat.userId` matches current user

- [ ] **Step 2: Run the new chat auth tests to verify they fail**

Run: `npm run test -- src/server/chat/chat-auth.test.ts`
Expected: FAIL because the module does not exist yet

- [ ] **Step 3: Add chat request schemas**

Implement `src/server/chat/chat-schemas.ts`:
- `chatQuerySchema`
- `renameChatSchema`
- `postChatSchema`

Suggested shapes:

```ts
export const renameChatSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

export const postChatSchema = z.object({
  chatId: z.string().cuid().optional(),
  message: z.string().trim().min(1).max(4000),
});
```

- [ ] **Step 4: Extend chat types and repository for ownership**

Update:
- `ChatRecord` to include `userId`
- repository list/load/find/create functions to require `userId`
- chat creation to use `data: { title, userId }`
- all reads to scope by the current user

Repository examples:
- `listChats(userId: string)`
- `getChatMessages(chatId: string, userId: string)`
- `getChatById(chatId: string, userId: string)`

- [ ] **Step 5: Add chat auth helpers**

Implement `src/server/chat/chat-auth.ts` and `src/server/chat/chat-errors.ts` with:
- `UnauthorizedError`
- `ForbiddenError`
- `requireAuthenticatedUser(currentUser)`
- `assertChatOwner(chat, currentUserId)`

These should let route handlers map expected auth failures to `401` or `403`, instead of collapsing everything into `500`.

- [ ] **Step 6: Update the chat service to require an authenticated actor**

Change service signatures to accept `userId`:
- `listChatSummaries(userId)`
- `loadChatMessages(userId, chatId)`
- `renameChat(userId, chatId, title)`
- `deleteChatById(userId, chatId)`
- `prepareChatReply({ userId, chatId, message })`

- [ ] **Step 7: Update `src/app/api/chat/route.ts`**

Refactor route handler flow:
- read current session from the auth service
- reject unauthenticated access with `401`
- parse query/body with `zod` schemas
- pass `currentUser.id` into chat service calls
- map:
  - schema failures -> `400`
  - missing session -> `401`
  - ownership failures -> `403`
  - unexpected failures -> `500`

- [ ] **Step 8: Update route and service tests**

Add or update tests for:
- unauthenticated requests return `401`
- invalid rename payload returns `400`
- invalid post payload returns `400`
- chat service uses `userId` in all calls

- [ ] **Step 9: Run the chat-focused test suite**

Run:
- `npm run test -- src/server/chat/chat-auth.test.ts`
- `npm run test -- src/server/chat/chat-repository.test.ts`
- `npm run test -- src/server/chat/chat-service.test.ts`
- `npm run test -- src/app/api/chat/route.test.ts`

Expected: PASS

## Task 4: Add Server-Side Page Bootstrap for the Home Route

**Files:**
- Create: `src/server/page/home-data.ts`
- Create: `src/server/page/home-data.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`

**Learning focus:** Practice the App Router mental model where pages are server entrypoints and client components handle only interactivity.

- [ ] **Step 1: Write failing tests for server-side home bootstrap**

Create `src/server/page/home-data.test.ts` covering:
- anonymous request returns a signed-out bootstrap state
- authenticated request returns current user and chat summaries
- `chatId` in search params loads initial messages for that chat only when owned by the current user

- [ ] **Step 2: Run the home-data tests to verify they fail**

Run: `npm run test -- src/server/page/home-data.test.ts`
Expected: FAIL because the module does not exist yet

- [ ] **Step 3: Implement `src/server/page/home-data.ts`**

Implement a focused loader such as:
- `getHomePageData({ selectedChatId }: { selectedChatId?: string })`

Behavior:
- read session cookie on the server
- if no current user, return signed-out bootstrap data
- if current user exists:
  - load current user summary
  - load chat list
  - optionally load current chat messages when `selectedChatId` is present

- [ ] **Step 4: Convert `src/app/page.tsx` into a real Server Component entry**

Update `src/app/page.tsx` to:
- accept `searchParams`
- call `getHomePageData`
- pass initial data into `ChatApp`

Target shape:

```tsx
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ chatId?: string }>;
}) {
  const { chatId } = await searchParams;
  const initialData = await getHomePageData({ selectedChatId: chatId });
  return <ChatApp initialData={initialData} />;
}
```

- [ ] **Step 5: Refactor `src/components/chat-app.tsx` to accept server-provided initial data**

Add props like:
- `currentUser`
- `initialChats`
- `initialMessages`
- `initialChatId`
- `isAuthenticated`

Then remove the current `initializeChatApp()` effect as the primary bootstrap path.

Keep client-side fetches only for:
- subsequent chat switching
- rename/delete actions
- sending new messages
- refreshing session state after login/logout

- [ ] **Step 6: Add minimal signed-out UI**

Do not redesign the app. Keep it simple:
- show a compact login/register area or clear signed-out state
- block chat submission until login succeeds
- after login, refresh the route or re-fetch session/bootstrap data

The goal is architectural clarity, not polished auth UX.

- [ ] **Step 7: Update client component tests**

Add or update tests for:
- rendering initial chats/messages from props
- showing signed-out state when unauthenticated
- not making redundant initial `GET /api/chat` bootstrap calls on first render

- [ ] **Step 8: Run the page and component tests**

Run:
- `npm run test -- src/server/page/home-data.test.ts`
- `npm run test -- src/components/chat-app.test.tsx`

Expected: PASS

## Task 5: Final Verification and Learning Review

**Files:**
- Modify: `README.md` if the new local auth flow needs short setup notes
- Modify: any of the above if verification finds gaps

**Learning focus:** Be able to explain the final architecture in plain language without reading the implementation diff.

- [ ] **Step 1: Run targeted verification in task order**

Run:
- `npm run test -- src/server/auth/auth-repository.test.ts`
- `npm run test -- src/server/auth/auth-service.test.ts`
- `npm run test -- src/app/api/auth/register/route.test.ts`
- `npm run test -- src/app/api/auth/login/route.test.ts`
- `npm run test -- src/app/api/auth/logout/route.test.ts`
- `npm run test -- src/app/api/auth/session/route.test.ts`
- `npm run test -- src/server/chat/chat-auth.test.ts`
- `npm run test -- src/server/chat/chat-service.test.ts`
- `npm run test -- src/app/api/chat/route.test.ts`
- `npm run test -- src/server/page/home-data.test.ts`
- `npm run test -- src/components/chat-app.test.tsx`

Expected: PASS

- [ ] **Step 2: Run full repository verification**

Run:
- `npm run lint`
- `npm run test`
- `npm run build`

Expected: PASS

- [ ] **Step 3: Review the final diff**

Run: `git diff --stat`
Expected:
- auth files added
- chat route/service/repository changed
- page and chat app updated
- no unrelated churn

- [ ] **Step 4: Write a short learning recap in your own words**

Before moving to the next phase, make sure you can explain:
- what data lives in `User`
- what data lives in `Session`
- why the cookie only stores a session token
- why `GET /api/chat?chatId=...` must still verify ownership on the server
- why `page.tsx` is now a better place for bootstrap reads than a first-render client `useEffect`

- [ ] **Step 5: Record the next-phase backlog, but do not mix it into this implementation**

After this plan is complete, the next backlog should be:
- `GuestSession`
- guest trial counting
- email verification token flow
- guest history merge
- E2E coverage for auth flows

## Manual Notes for This Phase

- Keep this phase intentionally narrow. Do not add guest mode back into the first implementation just because the larger product design includes it.
- Prefer simple route handlers over prematurely introducing middleware.
- Keep the auth UI minimal. The main learning value is the server/data boundary, not styling.
- If existing seed data or old chats block the `Chat.userId` migration, create a temporary local script or SQL note to map them to one learning user locally before continuing.
