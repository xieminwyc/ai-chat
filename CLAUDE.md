# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

AI Chat App — a full-stack AI chat application with streaming responses, user authentication, and guest access. Built with Next.js 16 App Router, Prisma 7, PostgreSQL, and the OpenAI SDK pointed at SiliconFlow's API. Documentation is in Chinese.

## Commands

| Task | Command |
|------|---------|
| Dev (local) | `npm run dev` |
| Dev (test env) | `npm run dev:test` |
| Dev (prod env) | `npm run dev:pro` |
| Build | `npm run build` |
| Start | `npm start` |
| Lint | `npm run lint` |
| Test (all) | `npm run test` |
| Test (single file) | `npx vitest run src/path/to/file.test.ts` |
| Test (watch) | `npx vitest src/path/to/file.test.ts` |
| Prisma generate | `npm run prisma:generate` |
| Prisma migrate | `npm run prisma:migrate:deploy` |

Environment switching uses `APP_ENV` via `scripts/env.mjs`, which loads the corresponding `.env.*` file. Append `:test` or `:pro` to prisma scripts for other environments.

## Architecture Overview

### Entry State System

The app uses a unified "Entry State" pattern to determine user access level. All pages/auth flows resolve through `entry-state.ts`:

```typescript
type EntryStateKind =
  | "signed_out_guest_preview"     // First visit, no cookies
  | "signed_out_guest_workspace"   // Using guest trial (3 messages)
  | "signed_out_auth_shell"        // Explicitly logged out
  | "authenticated_unverified"     // Registered but email not verified
  | "authenticated_verified";      // Fully authenticated user
```

Pages use `resolveProtectedPageAccess(entryState, "verified" | "authenticated")` to check access and get redirect targets.

### Auth System

**Three-layer architecture:**

```
src/server/auth/
├── auth-repository.ts    // Prisma data access (User, Session, EmailVerificationToken, PasswordResetToken)
├── auth-service.ts       // Business logic (loginUser, registerUser, changePasswordForUser, etc.)
├── auth-errors.ts        // Structured error classes extending AppError
├── auth-schemas.ts       // Zod validation schemas
├── session.ts            // Session token generation, cookie options
├── device-info.ts        // User-Agent parsing (device type, browser, OS)
├── password.ts           // Hashing (bcrypt) and verification
├── email-verification.ts // Email token workflow
└── password-reset.ts     // Forgot password flow
```

**Session management:**
- Cookie stores only opaque `token` (UUID)
- Every request resolves `token` → database → full user
- Sessions track: `deviceInfo` (JSON), `ipAddress`, `lastActiveAt`
- Password changes revoke all other sessions (security feature)
- `GET /api/auth/sessions` lists all active devices
- `DELETE /api/auth/sessions/:id` revokes a specific device

### Guest System

Unauthenticated users get a `GuestSession` with 3 free trial messages:

```
src/server/guest/
├── guest-repository.ts   // GuestSession CRUD, merge into User
├── guest-service.ts      // getOrCreateGuestSession, increment trial count
└── guest-session.ts      // Guest token, cookie names, TTL (7 days)
```

After registration, guest chats can be merged into the user account via `POST /api/guest/merge`.

### Chat System

```
src/server/chat/
├── chat-repository.ts    // Chat/Message CRUD with userId OR guestSessionId (XOR constraint)
├── chat-service.ts       // Business logic, guest→user merge handling
├── chat-stream.ts        // ReadableStream for AI streaming
└── chat-errors.ts        // Domain-specific errors (UnauthorizedError, ForbiddenError)
```

**Streaming:** Backend uses async generator → `ReadableStream` with `TextEncoder`. Frontend reads via `response.body.getReader()`. New chat IDs passed via `X-Chat-Id` response header.

### Error Handling

All domain errors extend `AppError` from `src/server/shared/errors/app-error.ts`:

```typescript
class AuthError extends AppError { ... }
class ChatError extends AppError { ... }
```

Use `toErrorResponse(error, { fallbackMessage })` in route handlers to convert errors to consistent JSON responses.

### Database Models

```
User (id, email, passwordHash, emailVerifiedAt)
  ├─→ Session[] (token, expiresAt, lastActiveAt, deviceInfo, ipAddress)
  ├─→ EmailVerificationToken[] (tokenHash, expiresAt, usedAt)
  ├─→ PasswordResetToken[] (tokenHash, expiresAt, usedAt)
  └─→ Chat[]

GuestSession (guestToken, trialMessageCount, mergedAt, expiresAt)
  └─→ Chat[]

Chat (id, title, userId XOR guestSessionId)
  └─→ Message[] (role, content, indexed on [chatId, createdAt])
```

`updatedAt` on Chat and GuestSession is maintained by DB trigger, not Prisma.

### API Routes

```
/api/auth/
├── register              → POST (create user, send verification email)
├── login                 → POST (create session with device info)
├── logout                → POST (delete session)
├── session               → GET (returns entry state + guest info)
├── password              → POST (change password, revokes other sessions)
├── forgot-password       → POST (send reset email)
├── reset-password        → POST (consume token, set new password)
├── resend-verification   → POST (resend email for unverified user)
└── sessions
    ├── /                 → GET (list all devices), DELETE (revoke all others)
    └── /[id]             → DELETE (revoke specific device)

/api/guest/
└── merge                 → POST (merge guest chats into user account)

/api/chat/
└── /                     → GET (list), POST (create), PATCH (update title), DELETE
```

### Path Alias & Testing

- `@/*` maps to `./src/*`
- Tests are colocated: `file.ts` → `file.test.ts`
- Vitest with jsdom environment
- Mock patterns in `auth-service.test.ts` show how to mock repository layer

### Settings Page

The `/settings` page requires verified email and contains:
- **SessionsForm** — View and revoke active devices
- **PasswordForm** — Change password (automatically revokes other sessions)
