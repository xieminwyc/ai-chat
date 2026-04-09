# Email Verification and Auth Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-pass email verification to the existing auth system so newly registered users must verify their email before they can use the full authenticated chat flow.

**Architecture:** Extend the existing `auth route -> service -> repository` stack with a one-time email verification token model, keep token generation and verification rules in the auth service layer, and surface verification state through the current session and homepage bootstrap payloads. Defer third-party email provider integration in this slice by introducing a local delivery boundary that can log or expose verification links during development without changing the verification model.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7, PostgreSQL, Vitest, Testing Library, Zod, Web Cookies API

---

## Scope Slice

The larger account-system spec at `docs/superpowers/specs/2026-04-02-auth-and-guest-trial-design.md` still contains three future subsystems:

1. email verification
2. guest-history merge after verification
3. real email delivery provider integration

This plan intentionally covers only subsystem `1`, with a lightweight local delivery seam for development. Guest merge and production-grade email provider setup should remain separate follow-up plans.

## Learning Checkpoints

- Before Task 1, review how `User`, `Session`, and `GuestSession` already divide identity responsibilities in the current schema.
- Before Task 2, review why one-time verification tokens should be stored as hashed secrets, not raw values.
- Before Task 3, read the relevant Next.js 16 docs in `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`.
- Before Task 4, be able to explain the difference between:
  - authenticated but unverified user
  - authenticated and verified user
  - guest viewer

## File Map

- Create: `src/server/auth/email-verification.ts`
- Create: `src/server/auth/email-delivery.ts`
- Create: `src/app/api/auth/resend-verification/route.ts`
- Create: `src/app/api/auth/resend-verification/route.test.ts`
- Create: `src/app/verify-email/page.tsx`
- Create: `src/app/verify-email/page.test.tsx`
- Modify: `prisma/schema.prisma`
- Modify: `src/server/auth/auth-types.ts`
- Modify: `src/server/auth/auth-repository.ts`
- Modify: `src/server/auth/auth-repository.test.ts`
- Modify: `src/server/auth/auth-schemas.ts`
- Modify: `src/server/auth/auth-service.ts`
- Modify: `src/server/auth/auth-service.test.ts`
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/register/route.test.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/login/route.test.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/session/route.test.ts`
- Modify: `src/server/chat/chat-auth.ts`
- Modify: `src/server/chat/chat-auth.test.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/chat/route.test.ts`
- Modify: `src/server/page/home-data.ts`
- Modify: `src/server/page/home-data.test.ts`
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`
- Modify: `.env.example`
- Modify: `.env.local` only if the developer wants a local `APP_URL`

## Target Behavior

- New users are created with `emailVerifiedAt = null`.
- Registration creates one active verification token for the user.
- Development mode can surface a verification URL without requiring a real email provider.
- Clicking the verification URL marks the user as verified and consumes the token.
- Expired or already-used tokens fail cleanly.
- Authenticated but unverified users can keep a session, but they cannot send or continue authenticated chat as a full user.
- Guest flows continue to work as they do now.
- Session and homepage bootstrap APIs expose whether the current user is verified.

## Task 1: Add Verification Data Model and Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/server/auth/auth-types.ts`
- Modify: `src/server/auth/auth-repository.ts`
- Modify: `src/server/auth/auth-repository.test.ts`

**Learning focus:** Understand how email verification state belongs on the `User`, while the one-time proof belongs in a separate token table with its own lifecycle.

- [ ] **Step 1: Add failing repository tests for verification persistence**

Extend `src/server/auth/auth-repository.test.ts` with cases for:
- storing `emailVerifiedAt` on `User`
- creating an email verification token record
- finding an active verification token with its user
- marking a verification token as used
- marking a user email as verified
- deleting prior unused verification tokens for a user

- [ ] **Step 2: Run the focused repository test to verify it fails**

Run: `npm test -- src/server/auth/auth-repository.test.ts`
Expected: FAIL because the verification fields and repository functions do not exist yet

- [ ] **Step 3: Extend Prisma schema for verification state**

Update `prisma/schema.prisma` to add:

```prisma
model User {
  emailVerifiedAt DateTime? @db.Timestamptz(3)
}

model EmailVerificationToken {
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique
  expiresAt  DateTime @db.Timestamptz(3)
  usedAt     DateTime? @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

Also add the back relation on `User`.

- [ ] **Step 4: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_email_verification_tokens`
Expected:
- migration file created under `prisma/migrations/...`
- Prisma client regenerates successfully

- [ ] **Step 5: Extend auth types**

Update `src/server/auth/auth-types.ts` to add:
- `emailVerifiedAt` to user-facing auth types
- `EmailVerificationTokenRecord`
- `EmailVerificationTokenWithUser`
- `CreateEmailVerificationTokenInput`

- [ ] **Step 6: Implement repository helpers**

Add focused helpers in `src/server/auth/auth-repository.ts`:
- `createEmailVerificationToken`
- `findEmailVerificationTokenByHash`
- `markEmailVerificationTokenUsed`
- `deleteUnusedEmailVerificationTokensByUserId`
- `markUserEmailVerified`

Keep the existing repository style: small Prisma wrappers with explicit `select`.

- [ ] **Step 7: Run the focused repository test to verify it passes**

Run: `npm test -- src/server/auth/auth-repository.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/auth/auth-types.ts src/server/auth/auth-repository.ts src/server/auth/auth-repository.test.ts
git commit -m "feat: add email verification persistence"
```

## Task 2: Add Verification Token Helpers and Service Logic

**Files:**
- Create: `src/server/auth/email-verification.ts`
- Modify: `src/server/auth/auth-service.ts`
- Modify: `src/server/auth/auth-service.test.ts`

**Learning focus:** Keep token mechanics and expiry math in focused helpers, while the auth service owns business rules like duplicate registration, one-active-token behavior, and consuming tokens safely.

- [ ] **Step 1: Add failing auth service tests for verification flows**

Extend `src/server/auth/auth-service.test.ts` with cases for:
- registration creates an unverified user
- registration creates a verification token
- registration invalidates prior unused verification tokens before issuing a new one
- verification rejects missing token
- verification rejects expired token
- verification marks token used and writes `emailVerifiedAt`
- resend verification requires an authenticated but unverified user

- [ ] **Step 2: Run the focused service test to verify it fails**

Run: `npm test -- src/server/auth/auth-service.test.ts`
Expected: FAIL because the verification helpers and service methods do not exist yet

- [ ] **Step 3: Add token helper utilities**

Implement `src/server/auth/email-verification.ts` with:
- `createEmailVerificationToken()`
- `hashEmailVerificationToken(token: string)`
- `getEmailVerificationExpiresAt()`
- `buildEmailVerificationUrl(token: string)`

Suggested constants:

```ts
const EMAIL_VERIFICATION_TTL_HOURS = 24;
```

Read `APP_URL` from env when building the URL, and fall back to `http://localhost:3000` for local development.

- [ ] **Step 4: Extend auth service with verification workflows**

Add service methods such as:
- `registerUser` returns both the safe user and a development verification URL or token payload for delivery
- `verifyEmailToken(token: string)`
- `resendVerificationEmailForUser(userId: string)`

Rules:
- do not create a login session during registration
- verification token lookup must use the hashed token
- verifying an already-used or expired token must fail cleanly
- successful verification sets `emailVerifiedAt` only once

- [ ] **Step 5: Refactor registration flow to centralize verification issuance**

Ensure `registerUser`:
- normalizes email
- hashes password
- creates the user
- deletes prior unused verification tokens for that user if needed
- creates a fresh verification token
- returns only safe user fields plus the delivery payload needed by the route

- [ ] **Step 6: Run the focused service test to verify it passes**

Run: `npm test -- src/server/auth/auth-service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/auth/email-verification.ts src/server/auth/auth-service.ts src/server/auth/auth-service.test.ts
git commit -m "feat: add email verification service flow"
```

## Task 3: Add Local Delivery Boundary and Verification Routes

**Files:**
- Create: `src/server/auth/email-delivery.ts`
- Create: `src/app/api/auth/resend-verification/route.ts`
- Create: `src/app/api/auth/resend-verification/route.test.ts`
- Create: `src/app/verify-email/page.tsx`
- Create: `src/app/verify-email/page.test.tsx`
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/register/route.test.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/session/route.test.ts`
- Modify: `.env.example`

**Learning focus:** Route handlers should translate HTTP into service calls, while delivery remains an interchangeable boundary instead of being hard-coded into registration.

- [ ] **Step 1: Add failing route tests for verification delivery and verification success**

Cover:
- register returns `201` and triggers verification delivery
- session payload includes verification state
- resend-verification returns `202` for an authenticated unverified user
- verify-email page renders success for a valid token
- verify-email page renders an error state for an expired or invalid token

- [ ] **Step 2: Run the focused route tests to verify they fail**

Run:
- `npm test -- src/app/api/auth/register/route.test.ts`
- `npm test -- src/app/api/auth/session/route.test.ts`
- `npm test -- src/app/api/auth/resend-verification/route.test.ts`
- `npm test -- src/app/verify-email/page.test.tsx`

Expected: FAIL because the delivery boundary and new routes do not exist yet

- [ ] **Step 3: Implement the local delivery boundary**

Create `src/server/auth/email-delivery.ts` with one clear responsibility:
- accept a safe delivery payload
- in local development, log or expose the verification URL
- keep the interface small so a real provider can replace it later

Example boundary:

```ts
export async function sendVerificationEmail(input: {
  email: string;
  verificationUrl: string;
}) {}
```

- [ ] **Step 4: Update registration route to trigger delivery**

Modify `src/app/api/auth/register/route.ts` so it:
- parses the body
- calls `registerUser`
- passes the delivery payload into `sendVerificationEmail`
- returns `201` with safe user data and a simple `requiresEmailVerification: true` flag

Do not return raw tokens in the production-shaped response.

- [ ] **Step 5: Add resend-verification route**

Implement `POST /api/auth/resend-verification`:
- resolve the current session from the auth cookie
- require an authenticated unverified user
- issue a fresh verification token
- trigger `sendVerificationEmail`
- return `202`

- [ ] **Step 6: Add a verification result page**

Implement `src/app/verify-email/page.tsx` as the email click target:
- read `token` from `searchParams`
- call `verifyEmailToken`
- render a simple success or failure state
- keep the page server-rendered

- [ ] **Step 7: Extend session route payload**

Modify `src/app/api/auth/session/route.ts` so authenticated responses include:
- `user.emailVerifiedAt`
- `user.isEmailVerified`

Keep guest behavior unchanged.

- [ ] **Step 8: Update `.env.example`**

Add:

```env
APP_URL="http://localhost:3000"
```

Keep real provider env vars out of this slice.

- [ ] **Step 9: Run the focused route tests to verify they pass**

Run the four test commands from Step 2 again
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/server/auth/email-delivery.ts src/app/api/auth/register/route.ts src/app/api/auth/register/route.test.ts src/app/api/auth/session/route.ts src/app/api/auth/session/route.test.ts src/app/api/auth/resend-verification/route.ts src/app/api/auth/resend-verification/route.test.ts src/app/verify-email/page.tsx src/app/verify-email/page.test.tsx .env.example
git commit -m "feat: add email verification routes"
```

## Task 4: Gate Authenticated Chat by Verification State

**Files:**
- Modify: `src/server/chat/chat-auth.ts`
- Modify: `src/server/chat/chat-auth.test.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/chat/route.test.ts`
- Modify: `src/server/page/home-data.ts`
- Modify: `src/server/page/home-data.test.ts`
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`

**Learning focus:** Authentication answers who the user is. Verification gating answers whether this authenticated user is allowed to use full product capabilities yet.

- [ ] **Step 1: Add failing tests for verified-user gating**

Cover:
- authenticated but unverified users receive a `403` when posting chat messages
- verified users continue to work unchanged
- guest users continue to work unchanged
- homepage bootstrap exposes the current user verification state
- client UI shows a verification-required state for authenticated unverified users

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:
- `npm test -- src/server/chat/chat-auth.test.ts`
- `npm test -- src/app/api/chat/route.test.ts`
- `npm test -- src/server/page/home-data.test.ts`
- `npm test -- src/components/chat-app.test.tsx`

Expected: FAIL because verification gating is not implemented yet

- [ ] **Step 3: Add a verified-user guard**

Extend `src/server/chat/chat-auth.ts` with a focused helper such as:
- `assertVerifiedUserSession(session)`

It should:
- throw `UnauthorizedError` when there is no authenticated session
- throw `ForbiddenError` with a verification-specific message when the user is authenticated but not yet verified

- [ ] **Step 4: Apply the guard in chat route resolution**

Modify `src/app/api/chat/route.ts` so authenticated user handling distinguishes:
- verified user -> normal user owner
- unverified user -> block write actions before the chat service runs

Guest handling should remain unchanged.

- [ ] **Step 5: Surface verification state through homepage data**

Extend `src/server/page/home-data.ts` so `currentUser` includes:
- `emailVerifiedAt`
- `isEmailVerified`

- [ ] **Step 6: Update client UI for the pending-verification state**

Modify `src/components/chat-app.tsx` so authenticated unverified users:
- keep seeing auth-aware UI
- do not appear as guests
- see a clear “please verify your email” message
- can use resend-verification UI later without rewriting state structure

- [ ] **Step 7: Run the focused tests to verify they pass**

Run the four test commands from Step 2 again
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/chat/chat-auth.ts src/server/chat/chat-auth.test.ts src/app/api/chat/route.ts src/app/api/chat/route.test.ts src/server/page/home-data.ts src/server/page/home-data.test.ts src/components/chat-app.tsx src/components/chat-app.test.tsx
git commit -m "feat: gate chat for unverified users"
```

## Task 5: Full Verification and Cleanup

**Files:**
- Modify: any of the above if verification finds gaps

- [ ] **Step 1: Run targeted verification in task order**

Run:
- `npm test -- src/server/auth/auth-repository.test.ts`
- `npm test -- src/server/auth/auth-service.test.ts`
- `npm test -- src/app/api/auth/register/route.test.ts`
- `npm test -- src/app/api/auth/session/route.test.ts`
- `npm test -- src/app/api/auth/resend-verification/route.test.ts`
- `npm test -- src/app/verify-email/page.test.tsx`
- `npm test -- src/server/chat/chat-auth.test.ts`
- `npm test -- src/app/api/chat/route.test.ts`
- `npm test -- src/server/page/home-data.test.ts`
- `npm test -- src/components/chat-app.test.tsx`

Expected: PASS

- [ ] **Step 2: Run repository-wide verification**

Run:
- `npm test`
- `npx prisma validate`

Expected:
- test suite passes
- Prisma schema validates

- [ ] **Step 3: Remove temporary debugging output if any was introduced**

Check for stray `console.log` or development-only debug branches in modified files and remove them before completion.

- [ ] **Step 4: Commit final polish if needed**

```bash
git add .
git commit -m "chore: polish email verification flow"
```

## Final Verification Checklist

- [ ] Newly registered users are unverified by default
- [ ] Verification tokens are one-time use and expire
- [ ] Development verification links can be surfaced without a third-party provider
- [ ] Verification success writes `emailVerifiedAt`
- [ ] Authenticated unverified users are blocked from full chat usage
- [ ] Verified users keep the current authenticated behavior
- [ ] Guest behavior does not regress
- [ ] `npm test` passes before completion

## Next Plan After This One

After this slice lands, write a follow-up plan for:

1. real email provider integration
2. post-login detection of mergeable guest history
3. `POST /api/guest/merge`
4. merged guest recovery behavior in the client
