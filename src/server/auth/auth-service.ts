import { prisma } from "@/lib/prisma";
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
import { withTransaction } from "@/server/shared/database/transaction";
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
import type { AuthSessionWithUser } from "@/server/auth/auth-types";
import { getCacheService } from "@/server/cache/cache-service";
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

const SESSION_CACHE_TTL_SECONDS = 5 * 60;
const SESSION_ACTIVITY_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function getSessionCacheKey(sessionToken: string) {
  return `auth:session:${sessionToken}`;
}

function toCachedSession(session: AuthSessionWithUser) {
  // Redis 里统一放可序列化数据，避免 Date 被隐式处理后读回来不一致。
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    lastActiveAt: session.lastActiveAt.toISOString(),
    user: {
      ...session.user,
      createdAt: session.user.createdAt.toISOString(),
      emailVerifiedAt: session.user.emailVerifiedAt?.toISOString() ?? null,
      updatedAt: session.user.updatedAt.toISOString(),
    },
  };
}

function parseDateValue(value: Date | string | null | undefined) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function fromCachedSession(
  cachedSession: ReturnType<typeof toCachedSession> | AuthSessionWithUser | null,
): AuthSessionWithUser | null {
  if (!cachedSession) {
    return null;
  }

  const createdAt = parseDateValue(cachedSession.createdAt);
  const expiresAt = parseDateValue(cachedSession.expiresAt);
  const lastActiveAt = parseDateValue(cachedSession.lastActiveAt);
  const userCreatedAt = parseDateValue(cachedSession.user.createdAt);
  const userUpdatedAt = parseDateValue(cachedSession.user.updatedAt);
  const userEmailVerifiedAt = parseDateValue(cachedSession.user.emailVerifiedAt);

  if (
    !createdAt ||
    !expiresAt ||
    !lastActiveAt ||
    !userCreatedAt ||
    !userUpdatedAt
  ) {
    // 只要关键时间字段坏掉，就把这份缓存当无效，回数据库拿真数据。
    return null;
  }

  return {
    ...cachedSession,
    createdAt,
    expiresAt,
    lastActiveAt,
    user: {
      ...cachedSession.user,
      createdAt: userCreatedAt,
      emailVerifiedAt: userEmailVerifiedAt,
      updatedAt: userUpdatedAt,
    },
  };
}

async function writeSessionToCache(session: AuthSessionWithUser) {
  await getCacheService().setJson(
    getSessionCacheKey(session.token),
    toCachedSession(session),
    { ttlSeconds: SESSION_CACHE_TTL_SECONDS },
  );
}

async function deleteSessionCache(sessionToken: string) {
  await getCacheService().delete(getSessionCacheKey(sessionToken));
}

async function deleteSessionCachesForUser(userId: string) {
  // 某些安全事件会影响一个用户的所有 session，只删单个 token 不够。
  const sessions = await findSessionsByUserId(userId);

  await Promise.all(
    sessions.map((session) => deleteSessionCache(session.token)),
  );
}

function scheduleSessionActivityRefresh(session: AuthSessionWithUser) {
  const timeSinceLastActive = Date.now() - session.lastActiveAt.getTime();

  if (timeSinceLastActive <= SESSION_ACTIVITY_REFRESH_INTERVAL_MS) {
    return;
  }

  const refreshedSession = {
    ...session,
    lastActiveAt: new Date(),
  };

  // 数据库更新时间和缓存更新时间都异步做，避免每次恢复 session 都卡住主请求。
  Promise.resolve(
    updateSessionLastActiveAt(session.token, refreshedSession.lastActiveAt),
  ).catch(() => {
    // 静默失败，不影响主流程
  });
  void writeSessionToCache(refreshedSession);
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

  const createdSession = await createSessionRecord({
    token: sessionToken,
    userId: user.id,
    expiresAt,
    deviceInfo,
    ipAddress,
  });

  const safeUser = {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  await writeSessionToCache({
    ...createdSession,
    user: safeUser,
  });

  return {
    sessionToken,
    expiresAt,
    // route handler 只需要把安全用户信息返回给前端。
    user: safeUser,
  };
}

export async function logoutUser(sessionToken: string) {
  // 退出登录的本质是让这个 session token 失效。
  await deleteSessionByToken(sessionToken);
  await deleteSessionCache(sessionToken);
}

// The cookie only carries an opaque session token.
// We always resolve the real user from the database on the server.
export async function getCurrentSession(sessionToken?: string | null) {
  if (!sessionToken) {
    return null;
  }

  // session 是高频读路径，先走缓存，miss 再回数据库。
  const cachedSession = fromCachedSession(
    await getCacheService().getJson<ReturnType<typeof toCachedSession>>(
      getSessionCacheKey(sessionToken),
    ),
  );

  if (cachedSession) {
    if (cachedSession.expiresAt.getTime() <= Date.now()) {
      await deleteSessionCache(sessionToken);
      await deleteSessionByToken(sessionToken);
      return null;
    }

    scheduleSessionActivityRefresh(cachedSession);
    return cachedSession;
  }

  const session = await findSessionByToken(sessionToken);

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    // 过期 session 顺手清掉，避免旧 token 一直留在库里。
    await deleteSessionByToken(sessionToken);
    await deleteSessionCache(sessionToken);
    return null;
  }

  // 只缓存已经确认有效的 session，避免把脏状态再次扩散出去。
  await writeSessionToCache(session);
  scheduleSessionActivityRefresh(session);

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
  const user = await markUserEmailVerified(verificationToken.userId, verifiedAt);

  // 邮箱验证状态已经变了，旧 session cache 里的 user 摘要也要一起失效。
  await deleteSessionCachesForUser(verificationToken.userId);

  return user;
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

  // 使用事务确保密码更新和 session 撤销原子性完成
  // 如果 session 撤销失败，密码更新也会回滚
  const updatedUser = await prisma.$transaction(async (tx) => {
    // 在事务内更新密码
    const updated = await tx.user.update({
      where: { id: userId },
      data: { passwordHash: nextPasswordHash },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 在事务内撤销其他 session
    if (currentSessionToken) {
      // 保留当前 session，撤销其他所有 session
      await tx.session.deleteMany({
        where: {
          userId,
          token: { not: currentSessionToken },
        },
      });
    } else {
      // 撤销所有 session（包括当前的）
      await tx.session.deleteMany({
        where: { userId },
      });
    }

    return updated;
  });

  // 事务成功后，清理缓存（缓存操作不需要在事务内）
  // 即使缓存清理失败，事务已经提交，密码已经更改
  await deleteSessionCachesForUser(userId);

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

  // 使用事务确保密码重置和 token 标记、session 撤销原子性完成
  const result = await prisma.$transaction(async (tx) => {
    // 在事务内更新密码
    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: nextPasswordHash },
    });

    // 在事务内标记 token 已使用
    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt },
    });

    // 在事务内撤销所有 session
    await tx.session.deleteMany({
      where: { userId: resetToken.userId },
    });

    return {
      id: resetToken.user.id,
      email: resetToken.user.email,
      emailVerifiedAt: resetToken.user.emailVerifiedAt,
      createdAt: resetToken.user.createdAt,
      updatedAt: usedAt,
    };
  });

  // 事务成功后，清理缓存
  await deleteSessionCachesForUser(resetToken.userId);

  return result;
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
  await deleteSessionCache(session.token);
}

/**
 * 撤销用户的所有其他 session（除了当前这个）
 */
export async function revokeAllOtherSessions(currentSessionToken: string) {
  const currentSession = await findSessionByToken(currentSessionToken);

  if (!currentSession) {
    throw new Error("Current session not found");
  }

  // 这里宁可多删一次当前 token 的 cache，也不要留下别的设备旧状态。
  await deleteSessionCachesForUser(currentSession.userId);
  await deleteAllUserSessionsExcept(currentSession.userId, currentSessionToken);
}

/**
 * 更新 session 的最后活跃时间
 */
export async function updateSessionActivity(sessionToken: string) {
  const now = new Date();
  await updateSessionLastActiveAt(sessionToken, now);
}
