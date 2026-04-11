import {
  createEmailVerificationToken as createEmailVerificationTokenRecord,
  createPasswordResetToken as createPasswordResetTokenRecord,
  createSessionRecord,
  createUser,
  deleteAllUserSessions,
  deleteAllUserSessionsExcept,
  deleteSessionById,
  deleteUnusedEmailVerificationTokensByUserId,
  deleteUnusedPasswordResetTokensByUserId,
  deleteSessionByToken,
  findEmailVerificationTokenByHash,
  findPasswordResetTokenByHash,
  findSessionById,
  findSessionByToken,
  findSessionsByUserId,
  findUserByEmail,
  findUserById,
  markEmailVerificationTokenUsed,
  markPasswordResetTokenUsed,
  markUserEmailVerified,
  updateSessionLastActiveAt,
  updateUserPasswordHash,
} from "@/server/auth/auth-repository";
import {
  CurrentPasswordIncorrectError,
  EmailAlreadyExistsError,
  EmailAlreadyVerifiedError,
  InvalidCredentialsError,
  PasswordReuseError,
  UserNotFoundError,
  VerificationTokenExpiredError,
  VerificationTokenInvalidError,
} from "@/server/auth/auth-errors";
import {
  buildEmailVerificationUrl,
  createEmailVerificationToken,
  getEmailVerificationExpiresAt,
  hashEmailVerificationToken,
} from "@/server/auth/email-verification";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  getPasswordResetExpiresAt,
  hashPasswordResetToken,
} from "@/server/auth/password-reset";
import { createSessionToken, getSessionExpiresAt } from "@/server/auth/session";
import type { DeviceInfo } from "@/server/auth/device-info";

type RegisterUserInput = {
  email: string;
  password: string;
};

type LoginUserInput = {
  email: string;
  password: string;
  // 设备信息，用于 session 追踪
  deviceInfo?: DeviceInfo;
  ipAddress?: string | null;
};

function normalizeEmail(email: string) {
  // 统一邮箱格式，避免 Alice@example.com 和 alice@example.com 被当成两个账号。
  return email.trim().toLowerCase();
}

async function issueEmailVerificationForUser(user: {
  id: string;
  email: string;
}) {
  const rawToken = createEmailVerificationToken();
  const expiresAt = getEmailVerificationExpiresAt();
  const tokenHash = hashEmailVerificationToken(rawToken);

  await deleteUnusedEmailVerificationTokensByUserId(user.id);
  await createEmailVerificationTokenRecord({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return {
    email: user.email,
    verificationUrl: buildEmailVerificationUrl(rawToken),
  };
}

export async function registerUser({ email, password }: RegisterUserInput) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new EmailAlreadyExistsError();
  }

  // service 层负责把“用户输入的明文密码”转换成“数据库可安全保存的 hash”。
  const passwordHash = await hashPassword(password);

  const user = await createUser({
    email: normalizedEmail,
    passwordHash,
  });

  const verification = await issueEmailVerificationForUser(user);

  return {
    user,
    ...verification,
  };
}

export async function loginUser({
  email,
  password,
  deviceInfo,
  ipAddress,
}: LoginUserInput) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  // 登录成功后，不把用户信息直接塞进 cookie，而是新建一条 session 记录。
  const sessionToken = createSessionToken();
  const expiresAt = getSessionExpiresAt();

  await createSessionRecord({
    token: sessionToken,
    userId: user.id,
    expiresAt,
    deviceInfo,
    ipAddress,
  });

  return {
    sessionToken,
    expiresAt,
    // route handler 只需要把安全用户信息返回给前端。
    user: {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
}

export async function logoutUser(sessionToken: string) {
  // 退出登录的本质是让这个 session token 失效。
  await deleteSessionByToken(sessionToken);
}

// The cookie only carries an opaque session token.
// We always resolve the real user from the database on the server.
export async function getCurrentSession(sessionToken?: string | null) {
  if (!sessionToken) {
    return null;
  }

  const session = await findSessionByToken(sessionToken);

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    // 过期 session 顺手清掉，避免旧 token 一直留在库里。
    await deleteSessionByToken(sessionToken);
    return null;
  }

  // 更新最后活跃时间（带节流机制，避免每次请求都写数据库）
  // 只在距离上次活跃超过 5 分钟时才更新
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  const timeSinceLastActive = Date.now() - session.lastActiveAt.getTime();

  if (timeSinceLastActive > FIVE_MINUTES_MS) {
    // 异步更新，不阻塞请求
    updateSessionLastActiveAt(sessionToken, new Date()).catch(() => {
      // 静默失败，不影响主流程
    });
  }

  return session;
}

export async function verifyEmailToken(token: string) {
  const tokenHash = hashEmailVerificationToken(token);
  const verificationToken = await findEmailVerificationTokenByHash(tokenHash);

  if (!verificationToken || verificationToken.usedAt) {
    throw new VerificationTokenInvalidError();
  }

  if (verificationToken.expiresAt.getTime() <= Date.now()) {
    throw new VerificationTokenExpiredError();
  }

  const verifiedAt = new Date();

  await markEmailVerificationTokenUsed(verificationToken.id, verifiedAt);

  return markUserEmailVerified(verificationToken.userId, verifiedAt);
}

export async function resendVerificationEmailForUser(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw new UserNotFoundError();
  }

  if (user.emailVerifiedAt) {
    throw new EmailAlreadyVerifiedError();
  }

  return issueEmailVerificationForUser(user);
}

export async function changePasswordForUser({
  userId,
  currentPassword,
  nextPassword,
  currentSessionToken,
}: {
  userId: string;
  currentPassword: string;
  nextPassword: string;
  // 当前 session token，用于保留当前登录态
  currentSessionToken?: string;
}) {
  const user = await findUserById(userId);

  if (!user) {
    throw new UserNotFoundError();
  }

  const passwordMatches = await verifyPassword(
    currentPassword,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new CurrentPasswordIncorrectError();
  }

  if (currentPassword === nextPassword) {
    throw new PasswordReuseError();
  }

  const nextPasswordHash = await hashPassword(nextPassword);
  const updatedUser = await updateUserPasswordHash(userId, nextPasswordHash);

  // 改密码后撤销所有其他 session，提升安全性
  if (currentSessionToken) {
    // 保留当前 session，撤销其他所有 session
    await deleteAllUserSessionsExcept(userId, currentSessionToken);
  } else {
    // 撤销所有 session（包括当前的）
    await deleteAllUserSessions(userId);
  }

  return updatedUser;
}

export async function requestPasswordResetForEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    return null;
  }

  const rawToken = createPasswordResetToken();
  const expiresAt = getPasswordResetExpiresAt();
  const tokenHash = hashPasswordResetToken(rawToken);

  await deleteUnusedPasswordResetTokensByUserId(user.id);
  await createPasswordResetTokenRecord({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return {
    email: user.email,
    resetUrl: buildPasswordResetUrl(rawToken),
  };
}

export async function resetPasswordWithToken({
  token,
  nextPassword,
}: {
  token: string;
  nextPassword: string;
}) {
  const tokenHash = hashPasswordResetToken(token);
  const resetToken = await findPasswordResetTokenByHash(tokenHash);

  if (!resetToken || resetToken.usedAt) {
    throw new Error("Password reset link is invalid or has already been used");
  }

  if (resetToken.expiresAt.getTime() <= Date.now()) {
    throw new Error("Password reset link has expired");
  }

  const nextPasswordHash = await hashPassword(nextPassword);
  const usedAt = new Date();

  await updateUserPasswordHash(resetToken.userId, nextPasswordHash);
  await markPasswordResetTokenUsed(resetToken.id, usedAt);

  // 密码重置后撤销该用户的所有 session，强制用户重新登录
  await deleteAllUserSessions(resetToken.userId);

  return {
    id: resetToken.user.id,
    email: resetToken.user.email,
    emailVerifiedAt: resetToken.user.emailVerifiedAt,
    createdAt: resetToken.user.createdAt,
    updatedAt: usedAt,
  };
}

// ========== Session 管理相关方法 ==========

/**
 * 获取用户的所有活跃 session
 */
export async function getAllUserSessions(userId: string) {
  return findSessionsByUserId(userId);
}

/**
 * 撤销指定的 session（用于"登出某个设备"）
 */
export async function revokeSessionById(sessionId: string, userId: string) {
  const session = await findSessionById(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  if (session.userId !== userId) {
    throw new Error("You can only revoke your own sessions");
  }

  await deleteSessionById(sessionId);
}

/**
 * 撤销用户的所有其他 session（除了当前这个）
 */
export async function revokeAllOtherSessions(currentSessionToken: string) {
  const currentSession = await findSessionByToken(currentSessionToken);

  if (!currentSession) {
    throw new Error("Current session not found");
  }

  await deleteAllUserSessionsExcept(currentSession.userId, currentSessionToken);
}

/**
 * 更新 session 的最后活跃时间
 */
export async function updateSessionActivity(sessionToken: string) {
  const now = new Date();
  await updateSessionLastActiveAt(sessionToken, now);
}
