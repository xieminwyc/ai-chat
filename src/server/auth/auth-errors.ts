import { AppError } from "@/server/shared/errors/app-error";

export const AUTH_ERROR_CODES = {
  CURRENT_PASSWORD_INCORRECT: "auth.current_password_incorrect",
  EMAIL_ALREADY_EXISTS: "auth.email_already_exists",
  EMAIL_ALREADY_VERIFIED: "auth.email_already_verified",
  EMAIL_DELIVERY_FAILED: "auth.email_delivery_failed",
  INTERNAL_ERROR: "auth.internal_error",
  INVALID_CREDENTIALS: "auth.invalid_credentials",
  INVALID_PAYLOAD: "auth.invalid_payload",
  PASSWORD_REUSE: "auth.password_reuse",
  UNAUTHORIZED: "auth.unauthorized",
  USER_NOT_FOUND: "auth.user_not_found",
  VERIFICATION_TOKEN_EXPIRED: "auth.verification_token_expired",
  VERIFICATION_TOKEN_INVALID: "auth.verification_token_invalid",
} as const;

class AuthError extends AppError {}

export class EmailAlreadyExistsError extends AuthError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
      message: "A user with this email already exists",
      httpStatus: 409,
    });
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      message: "Invalid email or password",
      httpStatus: 401,
    });
  }
}

export class VerificationTokenInvalidError extends AuthError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.VERIFICATION_TOKEN_INVALID,
      message: "Verification link is invalid or has already been used",
      httpStatus: 400,
    });
  }
}

export class VerificationTokenExpiredError extends AuthError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.VERIFICATION_TOKEN_EXPIRED,
      message: "Verification link has expired",
      httpStatus: 400,
    });
  }
}

export class EmailAlreadyVerifiedError extends AuthError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.EMAIL_ALREADY_VERIFIED,
      message: "Email is already verified",
      httpStatus: 400,
    });
  }
}

export class UserNotFoundError extends AuthError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.USER_NOT_FOUND,
      message: "User not found",
      httpStatus: 400,
    });
  }
}

export class CurrentPasswordIncorrectError extends AuthError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.CURRENT_PASSWORD_INCORRECT,
      message: "Current password is incorrect",
      httpStatus: 400,
    });
  }
}

export class PasswordReuseError extends AuthError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.PASSWORD_REUSE,
      message: "New password must be different",
      httpStatus: 400,
    });
  }
}

export class UnauthorizedAuthError extends AuthError {
  constructor(message = "Unauthorized") {
    super({
      code: AUTH_ERROR_CODES.UNAUTHORIZED,
      message,
      httpStatus: 401,
    });
  }
}

export class InvalidAuthPayloadError extends AuthError {
  constructor(message: string) {
    super({
      code: AUTH_ERROR_CODES.INVALID_PAYLOAD,
      message,
      httpStatus: 400,
    });
  }
}

export class EmailDeliveryFailedError extends AuthError {
  constructor(message = "Unable to send verification email", cause?: unknown) {
    super({
      code: AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED,
      message,
      httpStatus: 500,
      cause,
    });
  }
}
