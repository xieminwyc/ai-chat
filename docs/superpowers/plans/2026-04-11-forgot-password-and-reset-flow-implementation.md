# Forgot Password And Reset Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete minimal forgot-password and reset-password flow that lets users safely recover their account through a one-time email token without exposing whether an email is registered.

**Architecture:** Reuse the same broad pattern as email verification, but with a dedicated `PasswordResetToken` model, token utilities, repository methods, and email delivery function. Extend the existing login auth panel with a small forgot-password request view, add `/reset-password` as a dedicated page for setting a new password, and wire two new auth routes for requesting and consuming reset tokens.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, PostgreSQL, Zod, Resend, Vitest, Testing Library

---

## File Map

- Create: `prisma/migrations/<timestamp>_add_password_reset_tokens/migration.sql`
- Modify: `prisma/schema.prisma`
- Create: `src/server/auth/password-reset.ts`
- Create: `src/server/auth/password-reset.test.ts`
- Modify: `src/server/auth/auth-types.ts`
- Modify: `src/server/auth/auth-repository.ts`
- Modify: `src/server/auth/auth-repository.test.ts`
- Modify: `src/server/auth/auth-service.ts`
- Modify: `src/server/auth/auth-service.test.ts`
- Modify: `src/server/auth/auth-schemas.ts`
- Modify: `src/server/auth/email-delivery.ts`
- Create: `src/app/api/auth/forgot-password/route.ts`
- Create: `src/app/api/auth/forgot-password/route.test.ts`
- Create: `src/app/api/auth/reset-password/route.ts`
- Create: `src/app/api/auth/reset-password/route.test.ts`
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/reset-password/page.test.tsx`
- Modify: `progress.md`

## Task 1: Add Password Reset Token Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_password_reset_tokens/migration.sql`
- Create: `src/server/auth/password-reset.ts`
- Create: `src/server/auth/password-reset.test.ts`
- Modify: `src/server/auth/auth-types.ts`

- [ ] **Step 1: Write the failing password-reset utility tests**

Cover:
- creates a reset token
- hashes a reset token
- computes reset expiry
- builds a reset-password URL

- [ ] **Step 2: Run the focused utility test to verify it fails**

Run: `npm test -- src/server/auth/password-reset.test.ts`
Expected: FAIL because `password-reset.ts` does not exist yet

- [ ] **Step 3: Add the new Prisma model and utility module**

Add a dedicated `PasswordResetToken` model to Prisma with:
- `id`
- `userId`
- `tokenHash`
- `expiresAt`
- `usedAt`
- `createdAt`

Create `src/server/auth/password-reset.ts` with:
- `createPasswordResetToken()`
- `hashPasswordResetToken()`
- `getPasswordResetExpiresAt()`
- `buildPasswordResetUrl()`

- [ ] **Step 4: Run the focused utility test to verify it passes**

Run: `npm test -- src/server/auth/password-reset.test.ts`
Expected: PASS

## Task 2: Add Repository Support For Password Reset Tokens

**Files:**
- Modify: `src/server/auth/auth-types.ts`
- Modify: `src/server/auth/auth-repository.ts`
- Modify: `src/server/auth/auth-repository.test.ts`

- [ ] **Step 1: Write the failing repository tests**

Cover:
- create password reset token
- find password reset token by hash with user
- mark password reset token used
- delete unused password reset tokens by user id

- [ ] **Step 2: Run the focused repository test to verify it fails**

Run: `npm test -- src/server/auth/auth-repository.test.ts`
Expected: FAIL because repository helpers do not exist yet

- [ ] **Step 3: Implement minimal repository helpers**

Add:
- `createPasswordResetToken(...)`
- `findPasswordResetTokenByHash(...)`
- `markPasswordResetTokenUsed(...)`
- `deleteUnusedPasswordResetTokensByUserId(...)`

- [ ] **Step 4: Run the focused repository test to verify it passes**

Run: `npm test -- src/server/auth/auth-repository.test.ts`
Expected: PASS

## Task 3: Add Forgot/Reset Password Service Logic

**Files:**
- Modify: `src/server/auth/auth-service.ts`
- Modify: `src/server/auth/auth-service.test.ts`

- [ ] **Step 1: Write the failing auth-service tests**

Cover:
- forgot-password for existing user creates reset token and returns email payload
- forgot-password for unknown email returns a safe no-op result
- reset-password rejects missing token
- reset-password rejects used token
- reset-password rejects expired token
- reset-password updates password and consumes token on success

- [ ] **Step 2: Run the focused auth-service test to verify it fails**

Run: `npm test -- src/server/auth/auth-service.test.ts`
Expected: FAIL because forgot/reset service methods do not exist yet

- [ ] **Step 3: Implement minimal service methods**

Add:
- `requestPasswordResetForEmail(email)`
- `resetPasswordWithToken({ token, nextPassword })`

Rules:
- normalize email before lookup
- if user does not exist, return a safe no-op result
- for existing users, clear old unused reset tokens, create a new one, and return email payload
- reset flow must hash token, verify existence, verify not used, verify not expired, update password hash, and mark token used

- [ ] **Step 4: Run the focused auth-service test to verify it passes**

Run: `npm test -- src/server/auth/auth-service.test.ts`
Expected: PASS

## Task 4: Add Email Delivery For Reset Password

**Files:**
- Modify: `src/server/auth/email-delivery.ts`

- [ ] **Step 1: Write or extend failing email-delivery tests if present**

If there is no delivery test file yet, add the minimum needed coverage for reset-password email composition and error mapping.

- [ ] **Step 2: Run the focused email-delivery test to verify it fails**

Run the relevant email-delivery test file once created or extended.

- [ ] **Step 3: Implement minimal reset-password email delivery**

Add:
- reset-password email input type
- `sendPasswordResetEmail(...)`
- shared error handling consistent with verification email delivery

- [ ] **Step 4: Run the focused email-delivery test to verify it passes**

Run the relevant email-delivery test file.
Expected: PASS

## Task 5: Add Forgot/Reset Password Routes

**Files:**
- Create: `src/app/api/auth/forgot-password/route.ts`
- Create: `src/app/api/auth/forgot-password/route.test.ts`
- Create: `src/app/api/auth/reset-password/route.ts`
- Create: `src/app/api/auth/reset-password/route.test.ts`
- Modify: `src/server/auth/auth-schemas.ts`

- [ ] **Step 1: Write the failing route tests**

Cover:
- forgot-password accepts a valid email and always returns the same safe success payload
- forgot-password returns 400 for invalid payload
- reset-password returns 400 for invalid payload
- reset-password returns 400 for used/expired/invalid token errors
- reset-password returns 200 on success

- [ ] **Step 2: Run the focused route tests to verify they fail**

Run:
- `npm test -- src/app/api/auth/forgot-password/route.test.ts`
- `npm test -- src/app/api/auth/reset-password/route.test.ts`

Expected: FAIL because routes and schemas do not exist yet

- [ ] **Step 3: Implement minimal routes and schemas**

Add:
- `forgotPasswordSchema`
- `resetPasswordSchema`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

Forgot-password response must use a single safe success message regardless of whether the user exists.

- [ ] **Step 4: Run the focused route tests to verify they pass**

Run:
- `npm test -- src/app/api/auth/forgot-password/route.test.ts`
- `npm test -- src/app/api/auth/reset-password/route.test.ts`

Expected: PASS

## Task 6: Add Login-Side Forgot Password Request UI

**Files:**
- Modify: `src/components/chat-app.tsx`
- Modify: `src/components/chat-app.test.tsx`

- [ ] **Step 1: Write the failing chat-app tests**

Cover:
- login mode shows a `忘记密码？` affordance
- clicking it opens a minimal forgot-password request view
- submitting an email shows the safe success message
- user can return to the login form

- [ ] **Step 2: Run the focused chat-app test to verify it fails**

Run: `npm test -- src/components/chat-app.test.tsx`
Expected: FAIL because forgot-password UI does not exist yet

- [ ] **Step 3: Implement the minimal login-side forgot-password UI**

Update the auth panel to:
- show `忘记密码？` only in login mode
- switch between login/register and forgot-password request view
- submit to `/api/auth/forgot-password`
- show the unified success copy

- [ ] **Step 4: Run the focused chat-app test to verify it passes**

Run: `npm test -- src/components/chat-app.test.tsx`
Expected: PASS

## Task 7: Add Reset Password Page

**Files:**
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/reset-password/page.test.tsx`

- [ ] **Step 1: Write the failing reset-password page tests**

Cover:
- missing token renders a failure state
- valid token view renders next password + confirm password fields
- successful submission shows success guidance
- failed submission shows error feedback

- [ ] **Step 2: Run the focused page test to verify it fails**

Run: `npm test -- src/app/reset-password/page.test.tsx`
Expected: FAIL because the page does not exist yet

- [ ] **Step 3: Implement the minimal reset-password page**

Build:
- a Server Component page that reads `searchParams.token`
- a client-side form section for new password submission
- success/failure feedback with a clear route back to login

- [ ] **Step 4: Run the focused page test to verify it passes**

Run: `npm test -- src/app/reset-password/page.test.tsx`
Expected: PASS

## Task 8: Verify The Full Slice

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run forgot/reset focused tests together**

Run:
- `npm test -- src/server/auth/password-reset.test.ts`
- `npm test -- src/server/auth/auth-service.test.ts`
- `npm test -- src/app/api/auth/forgot-password/route.test.ts`
- `npm test -- src/app/api/auth/reset-password/route.test.ts`
- `npm test -- src/components/chat-app.test.tsx`
- `npm test -- src/app/reset-password/page.test.tsx`

Expected: PASS

- [ ] **Step 2: Run repository-wide quality checks**

Run:
- `npm run lint`
- `npm run build`

Expected:
- no new lint errors introduced by forgot-password work
- build succeeds with the new `/reset-password` page and new auth routes

- [ ] **Step 3: Update progress log**

Record:
- forgot-password entry added to login
- reset token persistence and reset routes added
- safe user-enumeration behavior preserved
- verification commands and outcomes
