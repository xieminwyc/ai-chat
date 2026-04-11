# Auth Error System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile `error.message` branching in auth APIs with typed domain errors and a shared HTTP error mapper.

**Architecture:** Introduce a small shared error foundation under `src/server/shared/errors`, keep service-layer code HTTP-agnostic, and let route handlers translate typed errors into stable JSON responses. Migrate auth first, then optionally expand the same pattern to guest and chat flows after the auth slice is stable.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, Zod

---

## File Map

- Create: `src/server/shared/errors/app-error.ts`
  Purpose: Base application error with `code`, `httpStatus`, and safe client message fields.
- Create: `src/server/shared/errors/error-response.ts`
  Purpose: Shared mapper from unknown errors to `NextResponse.json(...)`.
- Create: `src/server/shared/errors/error-response.test.ts`
  Purpose: Verify typed errors and unknown errors are mapped consistently.
- Create: `src/server/auth/auth-errors.ts`
  Purpose: Auth-specific typed errors such as duplicate registration, invalid credentials, unauthorized session, and password change failures.
- Modify: `src/server/chat/chat-errors.ts`
  Purpose: Rebase existing auth/authorization-related errors onto the shared base class instead of plain `Error`.
- Modify: `src/server/auth/auth-service.ts`
  Purpose: Throw typed auth errors instead of string-matched `Error`.
- Modify: `src/app/api/auth/register/route.ts`
  Purpose: Remove duplicate-registration message matching and use the shared mapper.
- Modify: `src/app/api/auth/login/route.ts`
  Purpose: Replace generic `Error -> 401` branching with typed error handling.
- Modify: `src/app/api/auth/password/route.ts`
  Purpose: Remove `error.message` checks and map typed auth errors to stable responses.
- Modify: `src/app/api/auth/resend-verification/route.ts`
  Purpose: Remove `error.message` checks and map typed auth/email errors to stable responses.
- Modify: `src/app/api/auth/register/route.test.ts`
  Purpose: Update route expectations to assert stable error shape and status after mapper adoption.
- Modify: `src/app/api/auth/login/route.test.ts`
  Purpose: Add invalid-login coverage for typed auth errors.
- Modify: `src/app/api/auth/password/route.test.ts`
  Purpose: Add typed failure-path tests instead of relying on message matching behavior.
- Modify: `src/app/api/auth/resend-verification/route.test.ts`
  Purpose: Add typed failure-path coverage for resend and email delivery failures.
- Modify: `src/server/auth/auth-service.test.ts`
  Purpose: Assert thrown auth error classes or error codes instead of only message strings.

### Task 1: Create The Shared Error Foundation

**Files:**
- Create: `src/server/shared/errors/app-error.ts`
- Create: `src/server/shared/errors/error-response.ts`
- Create: `src/server/shared/errors/error-response.test.ts`
- Modify: `src/server/chat/chat-errors.ts`

- [ ] **Step 1: Write the failing shared error mapper tests**

```ts
import { describe, expect, it } from "vitest";

import { AppError } from "@/server/shared/errors/app-error";
import { toErrorResponse } from "@/server/shared/errors/error-response";

describe("error-response", () => {
  it("maps AppError to its configured status and code", async () => {
    const response = toErrorResponse(
      new AppError({
        code: "demo.conflict",
        message: "Demo conflict",
        httpStatus: 409,
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "demo.conflict",
        message: "Demo conflict",
      },
    });
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npm test -- src/server/shared/errors/error-response.test.ts`
Expected: FAIL because the shared error modules do not exist yet.

- [ ] **Step 3: Implement the base error and response mapper**

```ts
export class AppError extends Error {
  code: string;
  httpStatus: number;
  expose: boolean;

  constructor(input: {
    code: string;
    message: string;
    httpStatus: number;
    expose?: boolean;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "AppError";
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.expose = input.expose ?? true;
  }
}
```

- [ ] **Step 4: Make existing auth-related chat errors extend the base class**

```ts
export class UnauthorizedError extends AppError {
  constructor(message = "登录状态已失效，请重新登录。") {
    super({
      code: "auth.unauthorized",
      message,
      httpStatus: 401,
    });
  }
}
```

- [ ] **Step 5: Run the shared tests plus the current chat/auth tests**

Run: `npm test -- src/server/shared/errors/error-response.test.ts src/server/auth src/app/api/auth`
Expected: PASS for the new shared test and no regressions in auth tests that still compile.

### Task 2: Define Auth Domain Errors

**Files:**
- Create: `src/server/auth/auth-errors.ts`
- Modify: `src/server/auth/auth-service.ts`
- Modify: `src/server/auth/auth-service.test.ts`

- [ ] **Step 1: Write failing auth-service tests for typed errors**

Add focused assertions for cases already present in the service:
- duplicate registration
- invalid login
- invalid verification token
- expired verification token
- user not found
- current password incorrect
- new password must be different

Example:

```ts
await expect(registerUser(input)).rejects.toMatchObject({
  code: "auth.email_already_exists",
  httpStatus: 409,
});
```

- [ ] **Step 2: Run the auth service test file**

Run: `npm test -- src/server/auth/auth-service.test.ts`
Expected: FAIL because services still throw plain `Error`.

- [ ] **Step 3: Add auth error classes**

Use one file for the first slice:

```ts
export class EmailAlreadyExistsError extends AppError {}
export class InvalidCredentialsError extends AppError {}
export class VerificationTokenInvalidError extends AppError {}
export class VerificationTokenExpiredError extends AppError {}
export class UserNotFoundError extends AppError {}
export class CurrentPasswordIncorrectError extends AppError {}
export class PasswordReuseError extends AppError {}
```

Keep the constructors opinionated so callers do not repeat status/code/message on every throw.

- [ ] **Step 4: Replace plain throws in `auth-service.ts`**

Convert these cases first:
- `A user with this email already exists`
- `Invalid email or password`
- `Verification link is invalid or has already been used`
- `Verification link has expired`
- `User not found`
- `Email is already verified`
- `Current password is incorrect`
- `New password must be different`

- [ ] **Step 5: Re-run auth service tests**

Run: `npm test -- src/server/auth/auth-service.test.ts`
Expected: PASS with typed error assertions.

### Task 3: Route-Level Error Mapping For Auth APIs

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/password/route.ts`
- Modify: `src/app/api/auth/resend-verification/route.ts`
- Modify: `src/app/api/auth/register/route.test.ts`
- Modify: `src/app/api/auth/login/route.test.ts`
- Modify: `src/app/api/auth/password/route.test.ts`
- Modify: `src/app/api/auth/resend-verification/route.test.ts`

- [ ] **Step 1: Add failing route tests for typed failures**

Cover at least:
- register duplicate email -> `409`
- login invalid credentials -> `401`
- password wrong current password -> `400`
- resend already verified -> `400`

Expected JSON shape:

```json
{
  "error": {
    "code": "auth.invalid_credentials",
    "message": "Invalid email or password"
  }
}
```

- [ ] **Step 2: Run the auth route tests to see current failures**

Run: `npm test -- src/app/api/auth/register/route.test.ts src/app/api/auth/login/route.test.ts src/app/api/auth/password/route.test.ts src/app/api/auth/resend-verification/route.test.ts`
Expected: FAIL for the new typed-error expectations.

- [ ] **Step 3: Replace route-local message matching with the shared mapper**

Target cleanup:
- remove `isDuplicateRegistrationError(...)`
- remove `isChangePasswordClientError(...)`
- remove `isResendVerificationClientError(...)`
- keep `ZodError` handling explicit, then fall through to `toErrorResponse(error)`

Suggested shape:

```ts
if (error instanceof ZodError) {
  return NextResponse.json(
    {
      error: {
        code: "request.invalid_payload",
        message: "Invalid password change payload",
      },
    },
    { status: 400 },
  );
}

return toErrorResponse(error, { fallbackMessage: "Change password route failed" });
```

- [ ] **Step 4: Keep email delivery failures typed too**

Do not leave email delivery on message checks forever. Either:
- convert `email-delivery.ts` to throw `AppError` subclasses now, or
- as a short-term bridge, wrap delivery errors at the route boundary into one typed infrastructure error class.

Preferred next step:

```ts
export class VerificationEmailDeliveryError extends AppError {}
```

- [ ] **Step 5: Re-run all auth route tests**

Run: `npm test -- src/app/api/auth`
Expected: PASS with stable status codes and JSON error shape.

### Task 4: Stabilize The First Public Error Contract

**Files:**
- Modify: `src/app/api/auth/register/route.test.ts`
- Modify: `src/app/api/auth/login/route.test.ts`
- Modify: `src/app/api/auth/password/route.test.ts`
- Modify: `src/app/api/auth/resend-verification/route.test.ts`
- Optional Create: `docs/project-notes/2026-04-11-auth-error-contract.md`

- [ ] **Step 1: Decide and freeze the public contract**

Use one consistent shape for all auth routes:

```json
{
  "error": {
    "code": "auth.invalid_credentials",
    "message": "Invalid email or password"
  }
}
```

Success responses should remain unchanged unless there is a clear product reason to change them.

- [ ] **Step 2: Add regression tests that assert the full error payload**

Avoid status-only assertions for important failures. Assert:
- `status`
- `error.code`
- `error.message`

- [ ] **Step 3: Run the focused auth suite**

Run: `npm test -- src/server/auth src/app/api/auth src/app/verify-email/page.test.tsx`
Expected: PASS

- [ ] **Step 4: Run the full project test suite**

Run: `npm test`
Expected: PASS

### Task 5: Optional Follow-Up After Auth Is Stable

**Files:**
- Modify: `src/app/api/guest/merge/route.ts`
- Modify: `src/server/chat/chat-auth.ts`
- Modify: `src/server/guest/guest-service.ts`

- [ ] **Step 1: Apply the same typed error system to guest merge and protected chat flows**

Start with existing cases already represented by:
- `UnauthorizedError`
- `ForbiddenError`

- [ ] **Step 2: Remove any remaining message-based branching outside auth**

Search:

Run: `rg -n "error\\.message|startsWith\\(|includes\\(" src/app src/server`

Expected: only intentional UX rendering code remains, not control-flow routing logic.

- [ ] **Step 3: Commit the auth slice before expanding**

```bash
git add src/server/shared/errors src/server/auth src/server/chat/chat-errors.ts src/app/api/auth docs/project-notes
git commit -m "refactor: add typed auth error handling"
```

## Scope Guardrails

- Do not refactor all server domains in one pass.
- Do not change successful JSON payloads unless the UI truly needs it.
- Do not mix rate limiting or audit logging into this slice; those belong to the next auth-security pass.
- Keep auth services free of `NextResponse` and other HTTP concerns.

## Recommended Order For You

1. Finish Task 1 and Task 2 first.
2. Convert `password` route first because it currently depends on `error.message` directly.
3. Then convert `login`, `register`, and `resend-verification`.
4. Only after auth tests are green, decide whether to migrate guest/chat routes.
